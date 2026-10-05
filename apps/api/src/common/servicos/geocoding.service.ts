import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type Coordenada = { latitude: number; longitude: number };

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Converte endereço em coordenadas (geocodificação) usando o Nominatim do
// OpenStreetMap — o mesmo OSM que o mapa do app já usa, sem chave de API. A
// política de uso deles pede: identificar o app (User-Agent) e no máximo 1
// consulta por segundo, por isso tudo passa por uma fila com intervalo.
// Serve de "plano B" pro mapa: lava jato que não capturou a localização
// (Mais > Localização) aparece no mapa pelo endereço cadastrado.
@Injectable()
export class GeocodingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GeocodingService.name);
  private fila: Promise<unknown> = Promise.resolve();
  private ultimaConsulta = 0;
  private preenchendo = false;

  constructor(private prisma: PrismaService) {}

  // Ao subir a API, completa quem já estava cadastrado sem coordenadas.
  onApplicationBootstrap() {
    void this.preencherPendentes();
  }

  private esperar(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async consultar(params: Record<string, string>): Promise<Coordenada | null> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    Object.entries({ format: "json", limit: "1", countrycodes: "br", ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "lavae/1.0 (divisionstech@gmail.com)", "Accept-Language": "pt-BR" },
      });
      if (!resp.ok) return null;
      const dados = (await resp.json()) as Array<{ lat: string; lon: string }>;
      if (!dados.length) return null;
      const latitude = Number(dados[0].lat);
      const longitude = Number(dados[0].lon);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Tenta do mais preciso pro mais genérico: rua+número+cidade, depois rua+
  // cidade, depois CEP, depois só cidade/UF (pelo menos cai no bairro/cidade
  // certa em vez de sumir do mapa).
  geocodificar(e: { logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null; endereco?: string | null }): Promise<Coordenada | null> {
    const executar = async () => {
      const espera = 1100 - (Date.now() - this.ultimaConsulta);
      if (espera > 0) await this.esperar(espera);
      const tentativas: Array<Record<string, string>> = [];
      if (e.logradouro && e.cidade) {
        tentativas.push({
          street: `${e.numero ? e.numero + " " : ""}${e.logradouro}`.trim(),
          city: e.cidade,
          state: e.uf ?? "",
        });
        tentativas.push({ street: e.logradouro, city: e.cidade, state: e.uf ?? "" });
      }
      if (e.cep) tentativas.push({ postalcode: e.cep, country: "Brasil" });
      if (e.cidade && e.uf) tentativas.push({ city: e.cidade, state: e.uf });
      if (!tentativas.length && e.endereco) tentativas.push({ q: e.endereco });

      for (const t of tentativas) {
        const params = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
        this.ultimaConsulta = Date.now();
        const achou = await this.consultar(params);
        if (achou) return achou;
        await this.esperar(1100);
      }
      return null;
    };
    const resultado = this.fila.then(executar, executar);
    this.fila = resultado.catch(() => null);
    return resultado;
  }

  // Geocodifica um lava jato e grava (sem tocar em coordenadas escolhidas
  // pelo dono). Chamado após cadastro/edição de endereço.
  async preencherLavaJato(id: string): Promise<void> {
    try {
      const lj = await this.prisma.lavaJato.findUnique({ where: { id } });
      if (!lj) return;
      const temGpsDoDono = lj.latitude != null && lj.longitude != null && !lj.coordenadasAuto;
      if (temGpsDoDono) return;
      const coord = await this.geocodificar(lj);
      await this.prisma.lavaJato.update({
        where: { id },
        data: coord
          ? { latitude: coord.latitude, longitude: coord.longitude, coordenadasAuto: true, geocodeTentadoEm: new Date() }
          : { geocodeTentadoEm: new Date() },
      });
    } catch (e: any) {
      this.logger.warn(`Geocodificação falhou para ${id}: ${e?.message ?? e}`);
    }
  }

  // Varre quem está sem coordenadas (e que não foi tentado nas últimas 24h).
  async preencherPendentes(limite = 25): Promise<void> {
    if (this.preenchendo) return;
    this.preenchendo = true;
    try {
      const pendentes = await this.prisma.lavaJato.findMany({
        where: {
          OR: [{ latitude: null }, { longitude: null }],
          endereco: { not: null },
          AND: [{ OR: [{ geocodeTentadoEm: null }, { geocodeTentadoEm: { lt: new Date(Date.now() - UM_DIA_MS) } }] }],
        },
        select: { id: true },
        take: limite,
      });
      for (const { id } of pendentes) await this.preencherLavaJato(id);
      if (pendentes.length) this.logger.log(`Endereços geocodificados: ${pendentes.length}`);
    } catch (e: any) {
      this.logger.warn(`preencherPendentes: ${e?.message ?? e}`);
    } finally {
      this.preenchendo = false;
    }
  }
}
