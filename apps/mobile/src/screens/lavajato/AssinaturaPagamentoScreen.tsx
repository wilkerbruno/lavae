import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { CartaoSalvoAssinatura, PagamentoAssinatura, centavosParaReais, identificarBandeiraLocal } from "@lavajato-app/shared";
import { api, mensagemErroApi } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DeviceIdCollector } from "../../components/DeviceIdCollector";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { MaisStackParamList } from "../../navigation/MaisStack";
import {
  corBandeira,
  formatarCpf,
  formatarNumeroCartao,
  formatarValidade,
  nomeBandeiraExibicao,
  tokenizarCartao,
} from "../../payments/cartaoNativo";

type Props = NativeStackScreenProps<MaisStackParamList, "AssinaturaPagamento">;

const NOVO_CARTAO = "novo" as const;

// Pagamento nativo da mensalidade/anuidade do SaaS com cartão — mesmo
// mecanismo (tokenização direto com o Mercado Pago, sem sair do app) que o
// cliente final usa pra pagar um agendamento, ver CartaoScreen. A diferença
// toda está em QUAL conta recebe o dinheiro (a da Divisions Tech, não a da
// lava jato — ver AssinaturasPagamentoService/MercadoPagoService) e em qual
// endpoint é chamado no fim (POST /assinaturas/minha/pagar, não
// /agendamentos/lote).
export function AssinaturaPagamentoScreen({ route, navigation }: Props) {
  const { planoId, nomePlano, periodicidade, valorCentavos } = route.params;

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [carregandoChave, setCarregandoChave] = useState(true);
  // Antes essa falha era só engolida (setPublicKey(null) e pronto) — o botão
  // ficava desabilitado pra sempre sem nenhuma explicação, dando a impressão
  // de "não acontece nada" ao selecionar cartão. Agora guardamos o motivo pra
  // mostrar na tela e oferecer "Tentar de novo".
  const [erroChave, setErroChave] = useState<string | null>(null);

  const [numero, setNumero] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [nomeTitular, setNomeTitular] = useState("");
  const [cpf, setCpf] = useState("");
  const [salvarNovoCartao, setSalvarNovoCartao] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [cartoesSalvos, setCartoesSalvos] = useState<CartaoSalvoAssinatura[]>([]);
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>(NOVO_CARTAO);
  const [cvvCartaoSalvo, setCvvCartaoSalvo] = useState("");
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const cartaoSelecionado = cartoesSalvos.find((c) => c.id === cartaoSelecionadoId) ?? null;

  // Ver comentário completo em CartaoScreen — mesmo mecanismo de captura do
  // Device ID antifraude do Mercado Pago (ticket WCS-50070).
  const deviceIdRef = useRef<string | null>(null);
  const deviceIdResolvidoRef = useRef(false);
  // Estável entre renders (deps vazias) — ver mesmo comentário em CartaoScreen.
  const aoReceberDeviceId = useCallback((id: string | null) => {
    deviceIdRef.current = id;
    deviceIdResolvidoRef.current = true;
  }, []);

  const numeroLimpo = numero.replace(/\D/g, "");
  const bandeira = useMemo(() => identificarBandeiraLocal(numeroLimpo), [numeroLimpo]);

  const carregarChave = useCallback(() => {
    setCarregandoChave(true);
    setErroChave(null);
    api
      .get<{ publicKey: string | null }>("/assinaturas/minha/mercadopago-public-key")
      .then(({ data }) => {
        setPublicKey(data.publicKey);
        if (!data.publicKey) {
          setErroChave("Pagamento com cartão está temporariamente indisponível. Tente pagar com Pix.");
        }
      })
      .catch((e) => {
        setPublicKey(null);
        setErroChave(mensagemErroApi(e, "Não foi possível carregar o pagamento com cartão."));
      })
      .finally(() => setCarregandoChave(false));
  }, []);

  useEffect(() => {
    carregarChave();
  }, [carregarChave]);

  useEffect(() => {
    api
      .get<CartaoSalvoAssinatura[]>("/assinaturas/minha/cartoes")
      .then(({ data }) => {
        setCartoesSalvos(data);
        if (data.length > 0) setCartaoSelecionadoId(data[0].id);
      })
      .catch(() => {});
  }, []);

  function validarCampos(): string | null {
    if (cartaoSelecionado) {
      if (cvvCartaoSalvo.length < 3 || cvvCartaoSalvo.length > 4) return "Código de segurança (CVV) inválido.";
      if (cpf.replace(/\D/g, "").length !== 11) return "CPF inválido.";
      return null;
    }
    const numeroLimpo = numero.replace(/\s/g, "");
    if (numeroLimpo.length < 13 || numeroLimpo.length > 19) return "Número do cartão inválido.";
    const [mes, ano] = validade.split("/").map((p) => p.trim());
    if (!mes || !ano || mes.length !== 2 || ano.length !== 2) return "Validade inválida. Use o formato MM/AA.";
    const mesNum = Number(mes);
    if (Number.isNaN(mesNum) || mesNum < 1 || mesNum > 12) return "Mês de validade inválido.";
    if (cvv.length < 3 || cvv.length > 4) return "Código de segurança (CVV) inválido.";
    if (!nomeTitular.trim()) return "Informe o nome impresso no cartão.";
    if (cpf.replace(/\D/g, "").length !== 11) return "CPF inválido.";
    return null;
  }

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

  // Mesmo cuidado de CartaoScreen: token NOVO, diferente do usado pra cobrar
  // (um token do Mercado Pago só serve pra uma operação). Roda depois do
  // pagamento já confirmado e nunca derruba o pagamento se falhar.
  async function salvarCartaoParaProximaVez() {
    try {
      const numeroLimpo = numero.replace(/\s/g, "");
      const [mes, anoCurto] = validade.split("/").map((p) => p.trim());
      const anoCompleto = 2000 + Number(anoCurto);
      const tokenParaSalvar = await tokenizar({
        card_number: numeroLimpo,
        expiration_month: Number(mes),
        expiration_year: anoCompleto,
        security_code: cvv,
        cardholder: { name: nomeTitular.trim(), identification: { type: "CPF", number: cpf.replace(/\D/g, "") } },
      });
      await api.post("/assinaturas/minha/cartoes", { cartaoToken: tokenParaSalvar, bin: numeroLimpo.slice(0, 6) });
    } catch (e) {
      console.warn("Não foi possível salvar o cartão da assinatura para a próxima vez:", e);
    }
  }

  async function confirmar() {
    if (!publicKey) {
      alertar("Cartão indisponível", "Pagamento com cartão está temporariamente indisponível. Tente pagar com Pix.");
      return;
    }
    const erro = validarCampos();
    if (erro) {
      alertar("Confira os dados do cartão", erro);
      return;
    }

    setEnviando(true);
    try {
      await aguardarDeviceId();

      let cartaoToken: string;
      let cartaoBin: string;
      const cpfLimpo = cpf.replace(/\D/g, "");

      if (cartaoSelecionado) {
        try {
          cartaoToken = await tokenizar({
            card_id: cartaoSelecionado.mercadoPagoCardId,
            customer_id: cartaoSelecionado.mercadoPagoCustomerId,
            security_code: cvvCartaoSalvo,
          });
        } catch (e: any) {
          alertar("Não foi possível validar o cartão", e?.message ?? "Confira o código de segurança e tente novamente.");
          return;
        }
        cartaoBin = cartaoSelecionado.bin;
      } else {
        const numeroLimpo = numero.replace(/\s/g, "");
        const [mes, anoCurto] = validade.split("/").map((p) => p.trim());
        const anoCompleto = 2000 + Number(anoCurto);
        try {
          cartaoToken = await tokenizar({
            card_number: numeroLimpo,
            expiration_month: Number(mes),
            expiration_year: anoCompleto,
            security_code: cvv,
            cardholder: { name: nomeTitular.trim(), identification: { type: "CPF", number: cpfLimpo } },
          });
        } catch (e: any) {
          alertar("Não foi possível validar o cartão", e?.message ?? "Confira os dados digitados e tente novamente.");
          return;
        }
        cartaoBin = numeroLimpo.slice(0, 6);
      }

      const { data } = await api.post<PagamentoAssinatura>("/assinaturas/minha/pagar", {
        planoId,
        periodicidade,
        metodoPagamento: "CARTAO",
        cartaoToken,
        cartaoBin,
        cartaoCpf: cpfLimpo,
        cartaoDeviceId: deviceIdRef.current ?? undefined,
      });

      if (!cartaoSelecionado && salvarNovoCartao) {
        await salvarCartaoParaProximaVez();
      }

      navigation.replace("AssinaturaPagamentoPendente", { pagamento: data });
    } catch (e: any) {
      alertar("Pagamento não aprovado", mensagemErroApi(e, "Não foi possível concluir o pagamento. Tente outro cartão."));
    } finally {
      setEnviando(false);
    }
  }

  function confirmarRemocao(cartao: CartaoSalvoAssinatura) {
    alertar(
      "Remover cartão",
      `Remover o cartão ${nomeBandeiraExibicao(cartao.bandeira)} final ${cartao.ultimosDigitos.slice(-3)}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            setRemovendoId(cartao.id);
            try {
              await api.delete(`/assinaturas/minha/cartoes/${cartao.id}`);
              setCartoesSalvos((atual) => {
                const restante = atual.filter((c) => c.id !== cartao.id);
                if (cartaoSelecionadoId === cartao.id) {
                  setCartaoSelecionadoId(restante.length > 0 ? restante[0].id : NOVO_CARTAO);
                }
                return restante;
              });
            } catch {
              alertar("Não foi possível remover", "Tente novamente em instantes.");
            } finally {
              setRemovendoId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DeviceIdCollector onDeviceId={aoReceberDeviceId} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ alignItems: "center", gap: spacing.xs }}>
            <Text style={styles.label}>
              {nomePlano} · {periodicidade === "ANUAL" ? "anual" : "mensal"}
            </Text>
            <Text style={styles.valor}>{centavosParaReais(valorCentavos)}</Text>
          </Card>

          {cartoesSalvos.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Cartão</Text>
              <View style={{ gap: spacing.sm }}>
                {cartoesSalvos.map((cartao) => {
                  const selecionado = cartao.id === cartaoSelecionadoId;
                  return (
                    <Pressable key={cartao.id} onPress={() => setCartaoSelecionadoId(cartao.id)}>
                      <Card style={[styles.linhaCartaoSalvo, selecionado && { borderColor: colors.accent, borderWidth: 2 }]}>
                        <View style={[styles.badgeBandeira, { backgroundColor: corBandeira(cartao.bandeira), marginTop: 0 }]}>
                          <Text style={styles.badgeBandeiraTexto}>{nomeBandeiraExibicao(cartao.bandeira)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.linhaCartaoTitulo}>•••• {cartao.ultimosDigitos.slice(-3)}</Text>
                          <Text style={styles.linhaCartaoSubtitulo}>
                            {cartao.nomeTitular}
                            {cartao.banco ? ` · ${cartao.banco}` : ""}
                          </Text>
                        </View>
                        {selecionado && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                        <Pressable hitSlop={10} onPress={() => confirmarRemocao(cartao)} disabled={removendoId === cartao.id}>
                          <Ionicons name="trash-outline" size={20} color={colors.inkMuted} />
                        </Pressable>
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
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs }}>
                  <Text style={styles.campoLabel}>Salvar este cartão para a próxima vez</Text>
                  <Switch
                    value={salvarNovoCartao}
                    onValueChange={setSalvarNovoCartao}
                    trackColor={{ false: colors.border, true: colors.accentSoft }}
                    thumbColor={salvarNovoCartao ? colors.accent : colors.inkMuted}
                  />
                </View>
              </Card>
            </>
          )}

          <Text style={styles.hint}>
            Pagamento processado com segurança pelo Mercado Pago — seus dados de cartão não passam pelos nossos servidores.
          </Text>

          {erroChave && !carregandoChave ? (
            <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
              <Text style={styles.erroTexto}>{erroChave}</Text>
              <Button label="Tentar de novo" onPress={carregarChave} variant="secondary" />
            </Card>
          ) : (
            <Button
              label={carregandoChave ? "Carregando…" : "Pagar agora"}
              onPress={confirmar}
              loading={enviando}
              disabled={carregandoChave || !publicKey}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted },
  valor: { fontSize: 28, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 11, color: colors.inkMuted, lineHeight: 16 },
  erroTexto: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  campoLabel: { fontSize: 13, color: colors.ink },
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
  badgeBandeira: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  badgeBandeiraTexto: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  linhaCartaoSalvo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linhaCartaoTitulo: { fontSize: 14, fontWeight: "700", color: colors.ink },
  linhaCartaoSubtitulo: { fontSize: 12, color: colors.inkMuted },
});
