import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import {
  AssinarPacoteMensalInput,
  AssinarPacoteMensalResultado,
  LavaJatoPublica,
  CartaoSalvo,
  centavosParaReais,
  identificarBandeiraLocal,
  MetodoPagamento,
  Pagamento,
  StatusPagamento,
  Veiculo,
} from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DeviceIdCollector } from "../../components/DeviceIdCollector";
import { VeiculoSelector } from "../../components/VeiculoSelector";
import { ajustesDoLavaJato, valoresParaPorte } from "../../utils/porte";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import {
  corBandeira,
  formatarCpf,
  formatarNumeroCartao,
  formatarValidade,
  nomeBandeiraExibicao,
  tokenizarCartao,
} from "../../payments/cartaoNativo";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";

// Parâmetros de rota dessa tela — registrada em DOIS stacks (HomeStack, a
// partir de LavaJatoDetailScreen, e ProfileStack, a partir de
// MeusPacotesScreen), por isso não usa NativeStackScreenProps tipado a um
// stack específico (ver comentário em HomeStack.tsx/ProfileStack.tsx).
export type AssinarPacoteParams = {
  lavaJatoId: string;
  pacoteMensalId: string;
  pacoteNome: string;
  // Preço BASE do pacote (porte HATCH) — o valor mensal de verdade depende do
  // porte do veículo escolhido nessa tela (ver valoresParaPorte).
  precoCentavos: number;
  // Veículo já escolhido (ao retomar uma assinatura existente — ver MeusPacotesScreen).
  veiculoId?: string;
  // Presente quando o cliente volta numa assinatura PENDENTE que já tinha um
  // pagamento avulso (Pix/cartão) iniciado (ver MeusPacotesScreen) — pula
  // direto pra tela de aguardar/QR em vez de pedir os dados de novo.
  pagamentoPendente?: Pagamento;
};

type Props = {
  route: { params: AssinarPacoteParams };
  navigation: { goBack: () => void };
};

const NOVO_CARTAO = "novo" as const;
const INTERVALO_POLL_MS = 4000;

// Tela única de assinatura de pacote mensal — tudo resolvido dentro do app,
// sem redirecionar pro site do Mercado Pago (ver PacotesMensaisService.assinar):
// o cliente escolhe Pix ou Cartão, pode marcar "renovação automática" só no
// Cartão, e essa mesma tela mostra o QR do Pix / aguarda a operadora do
// cartão até confirmar, sem precisar de uma segunda tela (diferente do fluxo
// de agendamento, que usa CartaoScreen + PagamentoScreen separadas porque só
// vive no HomeStack — esta tela precisa viver nos dois stacks).
export function AssinarPacoteScreen({ route, navigation }: Props) {
  const { lavaJatoId, pacoteMensalId, pacoteNome, precoCentavos: precoBaseCentavos } = route.params;

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [veiculoId, setVeiculoId] = useState<string | undefined>(route.params.veiculoId);
  const [ajustes, setAjustes] = useState(() => ajustesDoLavaJato(null));
  const veiculo = veiculos.find((v) => v.id === veiculoId);
  // Valor mensal do pacote para o porte do veículo escolhido (base enquanto não escolheu).
  const precoCentavos = veiculo ? valoresParaPorte(precoBaseCentavos, 0, veiculo.porte, ajustes).precoCentavos : precoBaseCentavos;
  const [carregandoChave, setCarregandoChave] = useState(true);

  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>(MetodoPagamento.PIX);
  const [automatico, setAutomatico] = useState(false);

  const [numero, setNumero] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [nomeTitular, setNomeTitular] = useState("");
  const [cpf, setCpf] = useState("");

  const [cartoesSalvos, setCartoesSalvos] = useState<CartaoSalvo[]>([]);
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>(NOVO_CARTAO);
  const [cvvCartaoSalvo, setCvvCartaoSalvo] = useState("");

  const [enviando, setEnviando] = useState(false);

  // Fase da tela: "formulario" (escolhendo método/dados) ou "aguardando"
  // (resultado em andamento — QR do Pix, cartão sendo confirmado, ou
  // assinatura automática já criada). `pagamentoPendente` (retomando uma
  // assinatura PENDENTE) já entra direto na segunda fase.
  const [fase, setFase] = useState<"formulario" | "aguardando">(route.params.pagamentoPendente ? "aguardando" : "formulario");
  const [pagamento, setPagamento] = useState<Pagamento | null>(route.params.pagamentoPendente ?? null);
  const [automaticoStatus, setAutomaticoStatus] = useState<"ATIVA" | "PENDENTE" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const pollAtivo = useRef(true);

  const cartaoSelecionado = cartoesSalvos.find((c) => c.id === cartaoSelecionadoId) ?? null;
  const numeroLimpo = numero.replace(/\D/g, "");
  const bandeira = useMemo(() => identificarBandeiraLocal(numeroLimpo), [numeroLimpo]);

  const deviceIdRef = useRef<string | null>(null);
  const deviceIdResolvidoRef = useRef(false);
  const aoReceberDeviceId = useCallback((id: string | null) => {
    deviceIdRef.current = id;
    deviceIdResolvidoRef.current = true;
  }, []);

  useEffect(() => {
    api
      .get<LavaJatoPublica>(`/lavajatos/${lavaJatoId}/publico`)
      .then(({ data }) => {
        setPublicKey(data.mercadoPagoPublicKey ?? null);
        setAjustes(ajustesDoLavaJato(data));
      })
      .catch(() => setPublicKey(null))
      .finally(() => setCarregandoChave(false));
  }, [lavaJatoId]);

  useEffect(() => {
    api
      .get<Veiculo[]>("/veiculos")
      .then(({ data }) => {
        setVeiculos(data);
        setVeiculoId((atual) => atual ?? data[0]?.id);
      })
      .catch(() => setVeiculos([]));
  }, []);

  useEffect(() => {
    api
      .get<CartaoSalvo[]>("/cartoes", { params: { lavaJatoId } })
      .then(({ data }) => {
        setCartoesSalvos(data);
        if (data.length > 0) setCartaoSelecionadoId(data[0].id);
      })
      .catch(() => {});
  }, [lavaJatoId]);

  useEffect(() => {
    pollAtivo.current = true;
    return () => {
      pollAtivo.current = false;
    };
  }, []);

  const consultarPagamento = useCallback(async () => {
    if (!pagamento) return;
    try {
      const { data } = await api.get<Pagamento>(`/pacotes-mensais/pagamentos/${pagamento.id}`);
      if (pollAtivo.current) setPagamento(data);
    } catch {
      // Ignora falha de rede pontual — o próximo tick tenta de novo.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento?.id]);

  useEffect(() => {
    if (!pagamento || pagamento.status !== StatusPagamento.PENDENTE) return;
    const id = setInterval(consultarPagamento, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [pagamento, consultarPagamento]);

  function aguardarDeviceId(): Promise<void> {
    return new Promise((resolve) => {
      if (deviceIdResolvidoRef.current) {
        resolve();
        return;
      }
      const limiteMs = 6000;
      const inicio = Date.now();
      const intervalo = setInterval(() => {
        if (deviceIdResolvidoRef.current || Date.now() - inicio > limiteMs) {
          clearInterval(intervalo);
          resolve();
        }
      }, 100);
    });
  }

  function tokenizar(corpo: Record<string, unknown>): Promise<string> {
    return tokenizarCartao(publicKey!, corpo);
  }

  function validarCampos(): string | null {
    if (metodoPagamento !== MetodoPagamento.CARTAO) return null;
    if (cartaoSelecionado) {
      if (cvvCartaoSalvo.length < 3 || cvvCartaoSalvo.length > 4) return "Código de segurança (CVV) inválido.";
      if (cpf.replace(/\D/g, "").length !== 11) return "CPF inválido.";
      return null;
    }
    const numeroLimpoLocal = numero.replace(/\s/g, "");
    if (numeroLimpoLocal.length < 13 || numeroLimpoLocal.length > 19) return "Número do cartão inválido.";
    const [mes, ano] = validade.split("/").map((p) => p.trim());
    if (!mes || !ano || mes.length !== 2 || ano.length !== 2) return "Validade inválida. Use o formato MM/AA.";
    const mesNum = Number(mes);
    if (Number.isNaN(mesNum) || mesNum < 1 || mesNum > 12) return "Mês de validade inválido.";
    if (cvv.length < 3 || cvv.length > 4) return "Código de segurança (CVV) inválido.";
    if (!nomeTitular.trim()) return "Informe o nome impresso no cartão.";
    if (cpf.replace(/\D/g, "").length !== 11) return "CPF inválido.";
    return null;
  }

  async function confirmar() {
    if (!veiculoId) {
      alertar("Escolha o veículo", "Selecione (ou cadastre) o veículo que será coberto pelo pacote.");
      return;
    }
    if (metodoPagamento === MetodoPagamento.CARTAO && !publicKey) {
      alertar("Cartão indisponível", "Esse lava jato ainda não está pronta para receber pagamento com cartão. Tente pagar com Pix.");
      return;
    }
    const erro = validarCampos();
    if (erro) {
      alertar("Confira os dados do cartão", erro);
      return;
    }

    setEnviando(true);
    try {
      const corpo: AssinarPacoteMensalInput = { veiculoId, metodoPagamento };

      if (metodoPagamento === MetodoPagamento.CARTAO) {
        await aguardarDeviceId();
        corpo.automatico = automatico;
        const cpfLimpo = cpf.replace(/\D/g, "");

        if (cartaoSelecionado) {
          try {
            corpo.cartaoToken = await tokenizar({
              card_id: cartaoSelecionado.mercadoPagoCardId,
              customer_id: cartaoSelecionado.mercadoPagoCustomerId,
              security_code: cvvCartaoSalvo,
            });
          } catch (e: any) {
            alertar("Não foi possível validar o cartão", e?.message ?? "Confira o código de segurança e tente novamente.");
            setEnviando(false);
            return;
          }
          corpo.cartaoBin = cartaoSelecionado.bin;
        } else {
          const numeroLimpoLocal = numero.replace(/\s/g, "");
          const [mes, anoCurto] = validade.split("/").map((p) => p.trim());
          const anoCompleto = 2000 + Number(anoCurto);
          try {
            corpo.cartaoToken = await tokenizar({
              card_number: numeroLimpoLocal,
              expiration_month: Number(mes),
              expiration_year: anoCompleto,
              security_code: cvv,
              cardholder: { name: nomeTitular.trim(), identification: { type: "CPF", number: cpfLimpo } },
            });
          } catch (e: any) {
            alertar("Não foi possível validar o cartão", e?.message ?? "Confira os dados digitados e tente novamente.");
            setEnviando(false);
            return;
          }
          corpo.cartaoBin = numeroLimpoLocal.slice(0, 6);
        }
        corpo.cartaoCpf = cpfLimpo;
        corpo.cartaoDeviceId = deviceIdRef.current ?? undefined;
      }

      const { data } = await api.post<AssinarPacoteMensalResultado>(`/pacotes-mensais/${pacoteMensalId}/assinar`, corpo);

      if (data.automatico) {
        setAutomaticoStatus(data.status);
      } else if (data.pagamento) {
        setPagamento(data.pagamento);
      }
      setFase("aguardando");
    } catch (e: any) {
      alertar("Não foi possível assinar", e?.response?.data?.message ?? "Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  async function copiarCodigoPix() {
    if (!pagamento?.pixCopiaECola) return;
    await Clipboard.setStringAsync(pagamento.pixCopiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  // ---------- Fase "aguardando" ----------

  if (fase === "aguardando") {
    if (automaticoStatus) {
      return (
        <SafeAreaView style={styles.center}>
          <View style={[styles.iconeCircle, { backgroundColor: colors.accentSoft }]}>
            <Text style={{ fontSize: 32 }}>{automaticoStatus === "ATIVA" ? "✓" : "⏳"}</Text>
          </View>
          <Text style={styles.tituloSucesso}>
            {automaticoStatus === "ATIVA" ? "Assinatura ativada!" : "Confirmando com o Mercado Pago…"}
          </Text>
          <Text style={styles.hint}>
            {automaticoStatus === "ATIVA"
              ? "A cobrança automática no cartão foi autorizada. Você pode acompanhar em Meus pacotes."
              : "Isso pode levar alguns instantes. Confira o status mais tarde em Meus pacotes."}
          </Text>
          <Button label="Voltar" onPress={() => navigation.goBack()} />
        </SafeAreaView>
      );
    }

    if (pagamento?.status === StatusPagamento.APROVADO) {
      return (
        <SafeAreaView style={styles.center}>
          <View style={[styles.iconeCircle, { backgroundColor: colors.accentSoft }]}>
            <Text style={{ fontSize: 32 }}>✓</Text>
          </View>
          <Text style={styles.tituloSucesso}>Pagamento confirmado!</Text>
          <Text style={styles.hint}>Sua assinatura está ativa. Você pode acompanhar em Meus pacotes.</Text>
          <Button label="Voltar" onPress={() => navigation.goBack()} />
        </SafeAreaView>
      );
    }

    if (pagamento?.status === StatusPagamento.RECUSADO) {
      return (
        <SafeAreaView style={styles.center}>
          <View style={[styles.iconeCircle, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ fontSize: 32 }}>✕</Text>
          </View>
          <Text style={styles.tituloSucesso}>Pagamento não aprovado</Text>
          <Text style={styles.hint}>Você pode tentar novamente com outro cartão ou com Pix.</Text>
          <Button label="Tentar novamente" onPress={() => { setFase("formulario"); setPagamento(null); }} />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={{ alignItems: "center", gap: spacing.xs }}>
            <Text style={styles.label}>Valor do período</Text>
            <Text style={styles.valor}>{centavosParaReais(pagamento?.valorCentavos ?? precoCentavos)}</Text>
          </Card>

          {pagamento?.metodo === MetodoPagamento.PIX ? (
            <>
              <Text style={styles.sectionTitle}>Pague com Pix</Text>
              {pagamento.pixQrCodeBase64 && (
                <Card style={{ alignItems: "center" }}>
                  <Image source={{ uri: `data:image/png;base64,${pagamento.pixQrCodeBase64}` }} style={styles.qrCode} resizeMode="contain" />
                </Card>
              )}
              {pagamento.pixCopiaECola && (
                <Card style={{ gap: spacing.sm }}>
                  <Text style={styles.hint}>Ou copie o código e cole no app do seu banco:</Text>
                  <Text style={styles.codigoPix} numberOfLines={3}>
                    {pagamento.pixCopiaECola}
                  </Text>
                  <Button label={copiado ? "Código copiado!" : "Copiar código"} onPress={copiarCodigoPix} variant="secondary" />
                </Card>
              )}
              <View style={styles.aguardando}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.hint}>Aguardando confirmação do pagamento…</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Pagamento com cartão</Text>
              <Text style={styles.hint}>Seu cartão já foi enviado para a operadora. Só um instante…</Text>
              <View style={styles.aguardando}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.hint}>Confirmando com a operadora do cartão…</Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Fase "formulario" ----------

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DeviceIdCollector onDeviceId={aoReceberDeviceId} />
      <KeyboardAvoid style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ alignItems: "center", gap: spacing.xs }}>
            <Text style={styles.label}>{pacoteNome}</Text>
            <Text style={styles.valor}>{centavosParaReais(precoCentavos)}</Text>
            <Text style={styles.hint}>por mês{veiculo ? ` · ${veiculo.placa}` : ""}</Text>
          </Card>

          <Text style={styles.sectionTitle}>Veículo coberto pelo pacote</Text>
          <VeiculoSelector
            veiculos={veiculos}
            selecionadoId={veiculoId}
            onSelect={(v) => setVeiculoId(v.id)}
            onCriado={(v) => {
              setVeiculos((atual) => [...atual, v]);
              setVeiculoId(v.id);
            }}
          />

          <Text style={styles.sectionTitle}>Como pagar</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable style={{ flex: 1 }} onPress={() => setMetodoPagamento(MetodoPagamento.PIX)}>
              <Card style={[styles.opcaoMetodo, metodoPagamento === MetodoPagamento.PIX && styles.opcaoMetodoSelecionada]}>
                <Ionicons name="qr-code-outline" size={20} color={colors.ink} />
                <Text style={styles.opcaoMetodoTexto}>Pix</Text>
              </Card>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => setMetodoPagamento(MetodoPagamento.CARTAO)}>
              <Card style={[styles.opcaoMetodo, metodoPagamento === MetodoPagamento.CARTAO && styles.opcaoMetodoSelecionada]}>
                <Ionicons name="card-outline" size={20} color={colors.ink} />
                <Text style={styles.opcaoMetodoTexto}>Cartão</Text>
              </Card>
            </Pressable>
          </View>

          {metodoPagamento === MetodoPagamento.CARTAO && (
            <>
              <Card style={styles.linhaAutomatico}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.campoLabel}>Pagamento automático</Text>
                  <Text style={styles.hint}>
                    {automatico
                      ? "O cartão será cobrado sozinho todo mês, sem você precisar voltar aqui."
                      : "Você paga agora e volta ao app pra pagar o próximo mês quando vencer."}
                  </Text>
                </View>
                <Switch
                  value={automatico}
                  onValueChange={setAutomatico}
                  trackColor={{ false: colors.border, true: colors.accentSoft }}
                  thumbColor={automatico ? colors.accent : colors.inkMuted}
                />
              </Card>

              {cartoesSalvos.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Cartão</Text>
                  <View style={{ gap: spacing.sm }}>
                    {cartoesSalvos.map((cartaoItem) => {
                      const selecionado = cartaoItem.id === cartaoSelecionadoId;
                      return (
                        <Pressable key={cartaoItem.id} onPress={() => setCartaoSelecionadoId(cartaoItem.id)}>
                          <Card style={[styles.linhaCartaoSalvo, selecionado && { borderColor: colors.accent, borderWidth: 2 }]}>
                            <View style={[styles.badgeBandeira, { backgroundColor: corBandeira(cartaoItem.bandeira), marginTop: 0 }]}>
                              <Text style={styles.badgeBandeiraTexto}>{nomeBandeiraExibicao(cartaoItem.bandeira)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.linhaCartaoTitulo}>•••• {cartaoItem.ultimosDigitos.slice(-3)}</Text>
                              <Text style={styles.linhaCartaoSubtitulo}>{cartaoItem.nomeTitular}</Text>
                            </View>
                            {selecionado && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                          </Card>
                        </Pressable>
                      );
                    })}
                    <Pressable onPress={() => setCartaoSelecionadoId(NOVO_CARTAO)}>
                      <Card style={[styles.linhaCartaoSalvo, cartaoSelecionadoId === NOVO_CARTAO && { borderColor: colors.accent, borderWidth: 2 }]}>
                        <Ionicons name="add-circle-outline" size={22} color={colors.ink} />
                        <Text style={styles.linhaCartaoTitulo}>Adicionar novo cartão</Text>
                      </Card>
                    </Pressable>
                  </View>
                </>
              )}

              {cartaoSelecionado ? (
                <>
                  <Text style={styles.sectionTitle}>Confirmar pagamento</Text>
                  <Card style={{ gap: spacing.sm }}>
                    <TextInput
                      value={cvvCartaoSalvo}
                      onChangeText={(t) => setCvvCartaoSalvo(t.replace(/\D/g, "").slice(0, 4))}
                      placeholder="CVV do cartão selecionado"
                      placeholderTextColor={colors.inkMuted}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      style={styles.input}
                    />
                    <TextInput
                      value={cpf}
                      onChangeText={(t) => setCpf(formatarCpf(t))}
                      placeholder="CPF do titular"
                      placeholderTextColor={colors.inkMuted}
                      keyboardType="number-pad"
                      maxLength={14}
                      style={styles.input}
                    />
                  </Card>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Dados do cartão</Text>
                  <Card style={{ gap: spacing.sm }}>
                    <TextInput
                      value={numero}
                      onChangeText={(t) => setNumero(formatarNumeroCartao(t))}
                      placeholder="Número do cartão"
                      placeholderTextColor={colors.inkMuted}
                      keyboardType="number-pad"
                      maxLength={23}
                      style={styles.input}
                    />
                    {numeroLimpo.length >= 6 && (
                      <View style={[styles.badgeBandeira, { backgroundColor: bandeira ? corBandeira(bandeira.paymentMethodId) : colors.inkMuted }]}>
                        <Text style={styles.badgeBandeiraTexto}>{bandeira ? bandeira.nome : "Bandeira não reconhecida"}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <TextInput
                        value={validade}
                        onChangeText={(t) => setValidade(formatarValidade(t))}
                        placeholder="MM/AA"
                        placeholderTextColor={colors.inkMuted}
                        keyboardType="number-pad"
                        maxLength={5}
                        style={[styles.input, { flex: 1 }]}
                      />
                      <TextInput
                        value={cvv}
                        onChangeText={(t) => setCvv(t.replace(/\D/g, "").slice(0, 4))}
                        placeholder="CVV"
                        placeholderTextColor={colors.inkMuted}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                        style={[styles.input, { flex: 1 }]}
                      />
                    </View>
                    <TextInput
                      value={nomeTitular}
                      onChangeText={setNomeTitular}
                      placeholder="Nome impresso no cartão"
                      placeholderTextColor={colors.inkMuted}
                      autoCapitalize="characters"
                      style={styles.input}
                    />
                    <TextInput
                      value={cpf}
                      onChangeText={(t) => setCpf(formatarCpf(t))}
                      placeholder="CPF do titular"
                      placeholderTextColor={colors.inkMuted}
                      keyboardType="number-pad"
                      maxLength={14}
                      style={styles.input}
                    />
                  </Card>
                </>
              )}
            </>
          )}

          <Text style={styles.hint}>Pagamento processado com segurança pelo Mercado Pago — seus dados de cartão não passam pelos nossos servidores.</Text>

          <Button
            label={carregandoChave && metodoPagamento === MetodoPagamento.CARTAO ? "Carregando…" : "Assinar"}
            onPress={confirmar}
            loading={enviando}
            disabled={(carregandoChave && metodoPagamento === MetodoPagamento.CARTAO) || (metodoPagamento === MetodoPagamento.CARTAO && !publicKey)}
          />
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted },
  valor: { fontSize: 28, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 11, color: colors.inkMuted, lineHeight: 16 },
  campoLabel: { fontSize: 13, color: colors.ink, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  opcaoMetodo: { alignItems: "center", gap: 4, paddingVertical: spacing.md },
  opcaoMetodoSelecionada: { borderColor: colors.accent, borderWidth: 2 },
  opcaoMetodoTexto: { fontSize: 13, fontWeight: "700", color: colors.ink },
  linhaAutomatico: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badgeBandeira: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  badgeBandeiraTexto: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  linhaCartaoSalvo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linhaCartaoTitulo: { fontSize: 14, fontWeight: "700", color: colors.ink },
  linhaCartaoSubtitulo: { fontSize: 12, color: colors.inkMuted },
  qrCode: { width: 220, height: 220 },
  codigoPix: { fontSize: 11, color: colors.ink, fontFamily: "monospace" },
  aguardando: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", marginTop: spacing.md },
  iconeCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  tituloSucesso: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
});
