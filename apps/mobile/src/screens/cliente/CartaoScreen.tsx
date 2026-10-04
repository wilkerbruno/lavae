import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { AgendamentoLoteCriado, LavaJatoPublica, CartaoSalvo, centavosParaReais, identificarBandeiraLocal } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { DeviceIdCollector } from "../../components/DeviceIdCollector";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";
import {
  corBandeira,
  formatarCpf,
  formatarNumeroCartao,
  formatarValidade,
  nomeBandeiraExibicao,
  tokenizarCartao,
} from "../../payments/cartaoNativo";

type Props = NativeStackScreenProps<HomeStackParamList, "Cartao">;

// Valor especial de `cartaoSelecionadoId` que significa "digitar um cartão
// novo" em vez de usar um dos salvos (ver seção "Cartão" no JSX abaixo).
const NOVO_CARTAO = "novo" as const;

// HTML_DEVICE_ID (WebView oculta que roda o antifraude do Mercado Pago) mora
// em payments/cartaoNativo.ts — reusado por AssinaturaPagamentoScreen (dono
// pagando a própria mensalidade do SaaS com o mesmo mecanismo). Ver o
// comentário completo lá (histórico do ticket WCS-50070).

// Formulário nativo de cartão — o cliente digita os dados AQUI, dentro do
// app, e eles nunca chegam ao nosso servidor: primeiro tokenizamos direto
// com o Mercado Pago (usando a chave PÚBLICA do lava jato), e só o token de
// uso único gerado por eles é que vai pro nosso backend, que cobra na hora
// (ver AgendamentosService.criarLote/MercadoPagoService.criarPagamentoCartao).
// Isso é o que permite o cliente nunca ser levado a um navegador/checkout
// externo — só esse próprio formulário.
//
// Também deixa o cliente escolher um CARTÃO SALVO (ver seção "Cartão"
// abaixo) em vez de digitar tudo de novo — ver CartoesService/CartaoSalvo na
// API. Pagar com um cartão salvo usa um token NOVO gerado a partir do
// card_id (POST /v1/card_tokens com card_id+customer_id+security_code, ver
// pagarComCartaoSalvo), então o restante do fluxo de cobrança
// (AgendamentosService.criarLote) nem percebe a diferença — sempre recebe um
// `cartaoToken` de uso único, exatamente como no cartão novo.
export function CartaoScreen({ route, navigation }: Props) {
  const { lavaJatoId, veiculoId, inicio, itens, valorCentavos } = route.params;

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [carregandoChave, setCarregandoChave] = useState(true);

  const [numero, setNumero] = useState("");
  const [validade, setValidade] = useState(""); // "MM/AA"
  const [cvv, setCvv] = useState("");
  const [nomeTitular, setNomeTitular] = useState("");
  const [cpf, setCpf] = useState("");
  const [salvarNovoCartao, setSalvarNovoCartao] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Cartões salvos desse lava jato (ver CartoesService.listar) — carregada em
  // paralelo com a chave pública, sem bloquear a tela: enquanto não chega,
  // o cliente já pode ir preenchendo um cartão novo normalmente.
  const [cartoesSalvos, setCartoesSalvos] = useState<CartaoSalvo[]>([]);
  const [cartaoSelecionadoId, setCartaoSelecionadoId] = useState<string>(NOVO_CARTAO);
  const [cvvCartaoSalvo, setCvvCartaoSalvo] = useState("");
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const cartaoSelecionado = cartoesSalvos.find((c) => c.id === cartaoSelecionadoId) ?? null;

  // Id do aparelho coletado pela WebView oculta (ver HTML_DEVICE_ID acima).
  // Usa ref (não state) porque só é lido dentro de confirmar(), nunca
  // renderizado — e porque confirmar() precisa enxergar o valor mais
  // recente mesmo estando no meio de uma função async já em execução (um
  // state capturado no início da função ficaria "congelado" no valor de
  // quando confirmar() foi chamada).
  //
  // HISTÓRICO (ticket WCS-50070, set/2026): o Mercado Pago pediu pra garantir
  // que o Device ID (X-Meli-Session-Id) vá em 100% das cobranças, não só
  // quando calhar de já estar pronto. Antes, `confirmar()` seguia direto pro
  // pagamento com o que `deviceId` state tivesse NA HORA do toque em "Pagar
  // agora" — como a WebView só populava esse state quando o script
  // antifraude terminava (até 5s, ver HTML_DEVICE_ID), um cliente rápido
  // (autofill, cartão salvo) podia disparar o pagamento antes disso, e o
  // header saía sem o dado. `deviceIdResolvidoRef` guarda se a coleta JÁ
  // terminou (com sucesso ou não) — `aguardarDeviceId` abaixo espera esse
  // sinal antes de seguir com o pagamento, em vez de simplesmente ler o
  // valor atual e continuar.
  const deviceIdRef = useRef<string | null>(null);
  const deviceIdResolvidoRef = useRef(false);
  // useCallback (deps vazias) pra ficar estável entre renders — o
  // DeviceIdCollector.web.tsx reinicia o polling do zero toda vez que essa
  // função muda de referência, e essa tela re-renderiza a cada tecla digitada
  // no formulário.
  const aoReceberDeviceId = useCallback((id: string | null) => {
    deviceIdRef.current = id;
    deviceIdResolvidoRef.current = true;
  }, []);

  // Bandeira reconhecida AO VIVO, direto dos dígitos já digitados — sem
  // nenhuma chamada de rede (ver identificarBandeiraLocal no pacote
  // compartilhado). Existe pra duas coisas: o cliente confirmar visualmente
  // que digitou o cartão certo, e o time de dev conferir na hora que a
  // bandeira bate com o cartão de teste, sem precisar olhar log do servidor
  // (era esse o pedido depois do bug de "bandeira sempre aparecia master").
  const numeroLimpo = numero.replace(/\D/g, "");
  const bandeira = useMemo(() => identificarBandeiraLocal(numeroLimpo), [numeroLimpo]);

  useEffect(() => {
    api
      .get<LavaJatoPublica>(`/lavajatos/${lavaJatoId}/publico`)
      .then(({ data }) => setPublicKey(data.mercadoPagoPublicKey ?? null))
      .catch(() => setPublicKey(null))
      .finally(() => setCarregandoChave(false));
  }, [lavaJatoId]);

  // Busca os cartões salvos SÓ desse lava jato (ver comentário em
  // ClienteMercadoPagoCustomer no schema — cada lava jato tem sua própria
  // conta Mercado Pago, então os cartões salvos não são compartilhados entre
  // lava jatos). Falha em silêncio: sem cartão salvo pra mostrar, a tela
  // segue funcionando normalmente com o formulário de cartão novo.
  useEffect(() => {
    api
      .get<CartaoSalvo[]>("/cartoes", { params: { lavaJatoId } })
      .then(({ data }) => {
        setCartoesSalvos(data);
        if (data.length > 0) setCartaoSelecionadoId(data[0].id);
      })
      .catch(() => {});
  }, [lavaJatoId]);

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

  // Espera a coleta do Device ID terminar (ver deviceIdResolvidoRef acima) —
  // a própria WebView oculta já desiste sozinha depois de ~5s (25 tentativas
  // x 200ms, ver HTML_DEVICE_ID), então esse limite é só uma folga de
  // segurança por cima disso; na prática, como a WebView monta junto com a
  // tela (bem antes do cliente terminar de digitar os dados do cartão), a
  // coleta quase sempre já terminou bem antes de chegar aqui, e essa espera
  // não chega a ser percebida.
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

  // Tokeniza direto com o Mercado Pago (ver payments/cartaoNativo.ts) — usado
  // tanto pro cartão novo (com os dados completos) quanto pro cartão salvo
  // (com card_id+customer_id no lugar do número). Devolve só o token de uso
  // único; o número do cartão em si nunca passa pelo nosso servidor.
  function tokenizar(corpo: Record<string, unknown>): Promise<string> {
    return tokenizarCartao(publicKey!, corpo);
  }

  // Salva o cartão recém-digitado pra próxima vez (ver checkbox "Salvar este
  // cartão" no JSX) — SEMPRE com um token NOVO, diferente do usado pra cobrar
  // o agendamento (um token do Mercado Pago só serve pra uma operação: ou
  // cobrar, ou anexar a um customer, nunca as duas). Roda depois do
  // agendamento já confirmado e nunca derruba o pagamento se falhar — só
  // avisa discretamente, porque o que importa mesmo pro cliente já aconteceu.
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
        cardholder: {
          name: nomeTitular.trim(),
          identification: { type: "CPF", number: cpf.replace(/\D/g, "") },
        },
      });
      await api.post("/cartoes", { lavaJatoId, cartaoToken: tokenParaSalvar, bin: numeroLimpo.slice(0, 6) });
    } catch (e) {
      // Não bloqueia nem avisa com um Alert (que exigiria toque pra
      // continuar) — o pagamento já foi aprovado, isso é só um extra.
      console.warn("Não foi possível salvar o cartão para a próxima vez:", e);
    }
  }

  async function confirmar() {
    if (!publicKey) {
      alertar(
        "Cartão indisponível",
        "Esse lava jato ainda não está pronta para receber pagamento com cartão. Tente pagar com Pix.",
      );
      return;
    }
    const erro = validarCampos();
    if (erro) {
      alertar("Confira os dados do cartão", erro);
      return;
    }

    setEnviando(true);
    try {
      // Ver comentário em aguardarDeviceId/deviceIdResolvidoRef acima —
      // garante que o pagamento só segue depois que a coleta do Device ID
      // já terminou (com ou sem sucesso), nunca no meio dela.
      await aguardarDeviceId();

      let cartaoToken: string;
      let cartaoBin: string;
      const cpfLimpo = cpf.replace(/\D/g, "");

      if (cartaoSelecionado) {
        // Cartão salvo: token novo a partir do card_id, sempre pedindo o CVV
        // de novo (o Mercado Pago não guarda o código de segurança).
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
            cardholder: {
              name: nomeTitular.trim(),
              identification: { type: "CPF", number: cpfLimpo },
            },
          });
        } catch (e: any) {
          alertar("Não foi possível validar o cartão", e?.message ?? "Confira os dados digitados e tente novamente.");
          return;
        }
        cartaoBin = numeroLimpo.slice(0, 6);
      }

      const { data } = await api.post<AgendamentoLoteCriado>("/agendamentos/lote", {
        veiculoId,
        inicio,
        itens,
        metodoPagamento: "CARTAO",
        cartaoToken,
        cartaoBin,
        cartaoCpf: cpfLimpo,
        cartaoDeviceId: deviceIdRef.current ?? undefined,
      });

      // Salva o cartão novo (se marcado) só DEPOIS do agendamento confirmado
      // — nunca antes, pra um problema ao salvar não atrapalhar o pagamento
      // que já funcionava.
      if (!cartaoSelecionado && salvarNovoCartao) {
        await salvarCartaoParaProximaVez();
      }

      if (data.pagamento) {
        navigation.replace("Pagamento", { pagamento: data.pagamento, aviso: data.aviso });
      } else {
        // Caso raro: uma assinatura de pacote mensal cobria o horário e o
        // servidor usou a cota dela em vez de cobrar o cartão (ver
        // AgendamentosService.encontrarAssinaturaPacoteElegivel).
        alertar("Agendamento confirmado!", "Reservado usando a cota do seu pacote mensal — o cartão não foi cobrado.");
        navigation.navigate("Home");
      }
    } catch (e: any) {
      alertar("Pagamento não aprovado", e?.response?.data?.message ?? "Não foi possível concluir o pagamento. Tente outro cartão.");
    } finally {
      setEnviando(false);
    }
  }

  function confirmarRemocao(cartao: CartaoSalvo) {
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
              await api.delete(`/cartoes/${cartao.id}`);
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
      {/* Coleta o Device ID antifraude do Mercado Pago em segundo plano — ver
          DeviceIdCollector (WebView oculta no nativo, injeção direta de
          script no Expo Web). */}
      <DeviceIdCollector onDeviceId={aoReceberDeviceId} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ alignItems: "center", gap: spacing.xs }}>
            <Text style={styles.label}>Valor a pagar</Text>
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
                      <Card
                        style={[
                          styles.linhaCartaoSalvo,
                          selecionado && { borderColor: colors.accent, borderWidth: 2 },
                        ]}
                      >
                        <View
                          style={[
                            styles.badgeBandeira,
                            { backgroundColor: corBandeira(cartao.bandeira), marginTop: 0 },
                          ]}
                        >
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
                        <Pressable
                          hitSlop={10}
                          onPress={() => confirmarRemocao(cartao)}
                          disabled={removendoId === cartao.id}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.inkMuted} />
                        </Pressable>
                      </Card>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => setCartaoSelecionadoId(NOVO_CARTAO)}>
                  <Card
                    style={[
                      styles.linhaCartaoSalvo,
                      cartaoSelecionadoId === NOVO_CARTAO && { borderColor: colors.accent, borderWidth: 2 },
                    ]}
                  >
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

          <Button
            label={carregandoChave ? "Carregando…" : "Pagar agora"}
            onPress={confirmar}
            loading={enviando}
            disabled={carregandoChave || !publicKey}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingBottom bem maior que o normal (não só spacing.xxl) de propósito:
  // reserva espaço extra pro botão "Pagar agora" conseguir ser rolado pra
  // cima do teclado mesmo em telas/Android onde o KeyboardAvoidingView
  // (behavior "height") não encolhe a área visível direito — ver
  // app.json > android.softwareKeyboardLayoutMode, que é a correção
  // definitiva disso (mas só vale a partir do próximo build nativo).
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: 220 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted },
  valor: { fontSize: 28, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 11, color: colors.inkMuted, lineHeight: 16 },
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
  badgeBandeira: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeBandeiraTexto: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  linhaCartaoSalvo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  linhaCartaoTitulo: { fontSize: 14, fontWeight: "700", color: colors.ink },
  linhaCartaoSubtitulo: { fontSize: 12, color: colors.inkMuted },
});
