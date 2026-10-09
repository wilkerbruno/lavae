import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PorteVeiculo } from "@lavajato-app/shared";

export interface DadosPlaca {
  encontrado: boolean;
  marca?: string;
  modelo?: string;
  cor?: string;
  ano?: string;
  porte?: PorteVeiculo;
}

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const LIMITE_POR_HORA = 20;

// Consulta de placa PLUGÁVEL e 100% opcional. Configure no ambiente da API:
//   PLACA_API_URL    ex: https://minha-api.exemplo.com/placa/{placa}   ({placa} é trocado pela placa)
//   PLACA_API_TOKEN  (opcional) enviado no header Authorization: Bearer <token>
//   PLACA_API_HEADER (opcional) nome de um header próprio p/ o token (ex: x-api-key)
// Sem PLACA_API_URL, ou se o provedor cair/não achar, devolve { encontrado:false }
// e o app só deixa o usuário preencher à mão. Nunca lança erro pro app.
@Injectable()
export class PlacaService {
  private readonly logger = new Logger(PlacaService.name);
  private cache = new Map<string, { dados: DadosPlaca; expira: number }>();
  private usos = new Map<string, number[]>();

  constructor(private config: ConfigService) {}

  private estourouLimite(usuarioId: string): boolean {
    const agora = Date.now();
    const recentes = (this.usos.get(usuarioId) ?? []).filter((t) => agora - t < 3_600_000);
    if (recentes.length >= LIMITE_POR_HORA) {
      this.usos.set(usuarioId, recentes);
      return true;
    }
    recentes.push(agora);
    this.usos.set(usuarioId, recentes);
    return false;
  }

  async consultar(usuarioId: string, placaBruta: string): Promise<DadosPlaca> {
    const nada: DadosPlaca = { encontrado: false };
    const url = this.config.get<string>("PLACA_API_URL")?.trim();
    const placa = placaBruta.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!url || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return nada;

    const emCache = this.cache.get(placa);
    if (emCache && emCache.expira > Date.now()) return emCache.dados;
    if (this.estourouLimite(usuarioId)) return nada;

    const headers: Record<string, string> = { Accept: "application/json" };
    const token = this.config.get<string>("PLACA_API_TOKEN")?.trim();
    if (token) {
      const nomeHeader = this.config.get<string>("PLACA_API_HEADER")?.trim();
      if (nomeHeader) headers[nomeHeader] = token;
      else headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const resp = await fetch(url.replace("{placa}", encodeURIComponent(placa)), { headers, signal: controller.signal });
      if (!resp.ok) return nada;
      const json = (await resp.json()) as unknown;
      const dados = this.mapear(json);
      // Só guarda em cache o que deu certo (falha não "gruda" por 30 dias).
      if (dados.encontrado) this.cache.set(placa, { dados, expira: Date.now() + TRINTA_DIAS_MS });
      return dados;
    } catch (e: any) {
      this.logger.warn(`Consulta de placa falhou: ${e?.name === "AbortError" ? "timeout" : e?.message ?? e}`);
      return nada;
    } finally {
      clearTimeout(timer);
    }
  }

  // Aceita os nomes de campo mais comuns (pt/en), na raiz ou dentro de
  // data/dados/result/veiculo — assim serve pra vários provedores.
  private mapear(json: unknown): DadosPlaca {
    const achatar = (o: any): any => {
      if (!o || typeof o !== "object") return {};
      for (const k of ["data", "dados", "result", "resultado", "veiculo", "vehicle"]) {
        if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) return { ...o, ...achatar(o[k]) };
      }
      return o;
    };
    const o = achatar(json);
    const pegar = (...chaves: string[]) => {
      for (const c of chaves) {
        const v = o[c] ?? o[c.toUpperCase()];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number") return String(v);
      }
      return undefined;
    };
    const marcaModelo = pegar("marcaModelo", "MARCA/MODELO");
    let marca = pegar("marca", "brand", "make");
    let modelo = pegar("modelo", "model");
    // Alguns provedores devolvem "VW/GOL 1.0" num campo só.
    if (!marca && marcaModelo?.includes("/")) [marca, modelo] = marcaModelo.split("/", 2).map((s) => s.trim());
    else if (!modelo && marcaModelo) modelo = marcaModelo;
    if (marca && modelo && modelo.toUpperCase().startsWith(marca.toUpperCase() + " ")) modelo = modelo.slice(marca.length + 1).trim();

    const cor = pegar("cor", "color");
    const ano = pegar("anoModelo", "ano_modelo", "ano", "year", "modelYear");
    if (!marca && !modelo) return { encontrado: false };
    return { encontrado: true, marca: titulo(marca), modelo: titulo(modelo), cor: titulo(cor), ano, porte: sugerirPorte(`${marca ?? ""} ${modelo ?? ""}`) };
  }
}

function titulo(t?: string) {
  if (!t) return undefined;
  return t.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

// Palpite de porte pelo nome do modelo — o cliente sempre pode trocar.
function sugerirPorte(texto: string): PorteVeiculo | undefined {
  const t = texto.toUpperCase();
  const tem = (...ps: string[]) => ps.some((p) => t.includes(p));
  if (tem("CG 160", "CG 150", "BIZ", "POP 110", "XRE", "NXR", "FAZER", "CB 300", "CB 500", "MT-0", "YBR", "FACTOR", "PCX", "NMAX", "LANDER", "TENERE", "BROS", "TITAN", "HONDA CG", "YAMAHA", "MOTO")) return PorteVeiculo.MOTO;
  if (tem("HILUX", "S10", "RANGER", "AMAROK", "TORO", "STRADA", "SAVEIRO", "MONTANA", "FRONTIER", "L200", "TRITON", "OROCH", "MAVERICK", "RAM ")) return PorteVeiculo.PICKUP;
  if (tem("COMPASS", "RENEGADE", "CRETA", "TRACKER", "T-CROSS", "NIVUS", "KICKS", "HR-V", "HRV", "TIGGO", "COROLLA CROSS", "SW4", "PAJERO", "TIGUAN", "TAOS", "DUSTER", "ECOSPORT", "PULSE", "FASTBACK", "EQUINOX", "TUCSON", "SPORTAGE", "SORENTO", "RAV4", "CAPTUR", "COMMANDER", "SUV")) return PorteVeiculo.SUV;
  if (tem("COROLLA", "CIVIC", "VIRTUS", "CRUZE", "JETTA", "SENTRA", "VERSA", "CITY", "LOGAN", "PRISMA", "ONIX PLUS", "CRONOS", "HB20S", "FUSION", "CAMRY", "ACCORD", "SEDAN")) return PorteVeiculo.SEDAN;
  return undefined;
}
