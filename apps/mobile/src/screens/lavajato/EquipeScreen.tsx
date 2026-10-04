import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { alertar } from "../../utils/alertaCompat";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FuncionarioDetalhado } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PasswordInput } from "../../components/PasswordInput";
import { ENDERECO_VAZIO, EnderecoForm, enderecoParaApi, enderecoValido } from "../../components/EnderecoForm";
import { colors, radius, spacing } from "../../theme/tokens";
import { MaisStackParamList } from "../../navigation/MaisStack";

type Props = NativeStackScreenProps<MaisStackParamList, "Equipe">;

const FUNCIONARIO_VAZIO = { nome: "", email: "", senha: "", telefone: "", cargo: "", comissaoPercentual: "60" };

interface Assinatura {
  plano: { nome: string; limiteFuncionarios: number | null };
}

// Gestão da equipe: o dono cadastra o login de cada funcionário (nome/e-mail/
// senha) — não existe autocadastro, é sempre um convite feito por aqui. Cada
// funcionário organiza a própria agenda (horário de trabalho e folgas) depois
// de logar (ver HorariosScreen no app do funcionário). A quantidade de
// funcionários ativos respeita o limite do plano contratado (ver garantirDentroDoLimiteDoPlano na API).
export function EquipeScreen({ navigation }: Props) {
  const [funcionarios, setFuncionarios] = useState<FuncionarioDetalhado[]>([]);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [campos, setCampos] = useState(FUNCIONARIO_VAZIO);
  const [endereco, setEndereco] = useState(ENDERECO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  // Edição do telefone de um funcionário já cadastrado — só o dono tem acesso
  // a esse campo (ver UsuariosService.atualizarMeuPerfil, que recusa o
  // próprio funcionário tentando mudar o seu).
  const [editandoTelefoneId, setEditandoTelefoneId] = useState<string | null>(null);
  const [telefoneEditado, setTelefoneEditado] = useState("");
  const [salvandoTelefone, setSalvandoTelefone] = useState(false);

  const carregar = useCallback(async () => {
    const [funcionariosRes, assinaturaRes] = await Promise.all([
      api.get<FuncionarioDetalhado[]>("/funcionarios"),
      api.get<Assinatura>("/assinaturas/minha").catch(() => ({ data: null })),
    ]);
    setFuncionarios(funcionariosRes.data);
    setAssinatura(assinaturaRes.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  function abrirNovo() {
    setCampos(FUNCIONARIO_VAZIO);
    setEndereco(ENDERECO_VAZIO);
    setFormAberto(true);
  }

  async function salvar() {
    const nome = campos.nome.trim();
    const email = campos.email.trim().toLowerCase();
    const senha = campos.senha;
    const comissaoPercentual = campos.comissaoPercentual ? parseInt(campos.comissaoPercentual, 10) : undefined;

    if (!nome) return alertar("Falta o nome", "Digite o nome do funcionário.");
    if (!email.includes("@")) return alertar("E-mail inválido", "Digite um e-mail válido.");
    if (senha.length < 6) return alertar("Senha muito curta", "A senha precisa ter pelo menos 6 caracteres.");
    if (comissaoPercentual !== undefined && (!Number.isInteger(comissaoPercentual) || comissaoPercentual < 0 || comissaoPercentual > 100)) {
      return alertar("Comissão inválida", "Digite um valor entre 0 e 100.");
    }

    const telefone = campos.telefone.trim() || undefined;
    if (telefone && telefone.replace(/\D/g, "").length < 8) {
      return alertar("Telefone inválido", "Digite um telefone válido com DDD, ou deixe em branco.");
    }

    if (!enderecoValido(endereco)) {
      return alertar("Endereço obrigatório", "Digite o endereço completo do funcionário (CEP, rua, número, bairro, cidade).");
    }

    const dto = {
      nome,
      email,
      senha,
      telefone,
      endereco: enderecoParaApi(endereco),
      cargo: campos.cargo.trim() || undefined,
      comissaoPercentual,
    };
    setSalvando(true);
    try {
      await api.post("/funcionarios", dto);
      setFormAberto(false);
      carregar();
    } catch (e: any) {
      alertar("Não foi possível cadastrar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(funcionario: FuncionarioDetalhado) {
    try {
      await api.patch(`/funcionarios/${funcionario.id}`, { ativo: !funcionario.ativo });
      carregar();
    } catch (e: any) {
      alertar("Não foi possível atualizar", e?.response?.data?.message ?? "Tente de novo.");
    }
  }

  function iniciarEdicaoTelefone(funcionario: FuncionarioDetalhado) {
    setEditandoTelefoneId(funcionario.id);
    setTelefoneEditado(funcionario.usuario.telefone ?? "");
  }

  async function salvarTelefone(id: string) {
    const telefone = telefoneEditado.trim();
    if (telefone && telefone.replace(/\D/g, "").length < 8) {
      return alertar("Telefone inválido", "Digite um telefone válido com DDD.");
    }
    setSalvandoTelefone(true);
    try {
      await api.patch(`/funcionarios/${id}`, { telefone: telefone || undefined });
      setEditandoTelefoneId(null);
      carregar();
    } catch (e: any) {
      alertar("Não foi possível salvar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvandoTelefone(false);
    }
  }

  const ativos = funcionarios.filter((f) => f.ativo).length;
  const limite = assinatura?.plano.limiteFuncionarios ?? null;
  const textoUso =
    limite == null ? `${ativos} funcionário${ativos === 1 ? "" : "s"} (plano ilimitado)` : `${ativos} de ${limite} funcionários do plano ${assinatura?.plano.nome ?? ""}`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Equipe</Text>
          <Text style={styles.usage}>{textoUso}</Text>
        </View>
        {!formAberto && <Text style={styles.addButton} onPress={abrirNovo}>+ Novo</Text>}
      </View>

      <FlatList
        data={funcionarios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          formAberto ? (
            <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              <Text style={styles.formTitle}>Novo funcionário</Text>
              <Text style={styles.hint}>Ele vai usar esse e-mail e senha pra logar no app.</Text>
              <TextInput
                value={campos.nome}
                onChangeText={(nome) => setCampos((c) => ({ ...c, nome }))}
                placeholder="Nome"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <TextInput
                value={campos.email}
                onChangeText={(email) => setCampos((c) => ({ ...c, email }))}
                placeholder="E-mail"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <PasswordInput
                value={campos.senha}
                onChangeText={(senha) => setCampos((c) => ({ ...c, senha }))}
                placeholder="Senha (mínimo 6 caracteres)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <TextInput
                value={campos.telefone}
                onChangeText={(telefone) => setCampos((c) => ({ ...c, telefone }))}
                placeholder="Telefone (opcional — só você tem acesso)"
                placeholderTextColor={colors.inkMuted}
                keyboardType="phone-pad"
                style={styles.input}
              />
              <EnderecoForm
                valores={endereco}
                onChange={setEndereco}
                hint='O endereço é só do funcionário: depois de cadastrado, só ele vê ou edita esse dado (em "Perfil").'
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput
                  value={campos.cargo}
                  onChangeText={(cargo) => setCampos((c) => ({ ...c, cargo }))}
                  placeholder="Cargo (ex: Lavador)"
                  placeholderTextColor={colors.inkMuted}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={campos.comissaoPercentual}
                  onChangeText={(comissaoPercentual) => setCampos((c) => ({ ...c, comissaoPercentual }))}
                  placeholder="Comissão %"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" variant="secondary" onPress={() => setFormAberto(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Cadastrar" onPress={salvar} loading={salvando} />
                </View>
              </View>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          !formAberto ? <Text style={styles.empty}>Nenhum funcionário cadastrado ainda. Toque em "+ Novo".</Text> : null
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.xs, opacity: item.ativo ? 1 : 0.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.name}>{item.usuario.nome}</Text>
                <Text style={styles.meta}>{item.usuario.email}</Text>
                <Text style={styles.meta}>
                  {item.cargo} · {item.comissaoPercentual}% de comissão
                </Text>
                {!item.disponivel && <Text style={styles.meta}>Indisponível para novos agendamentos</Text>}
              </View>
            </View>

            {editandoTelefoneId === item.id ? (
              <View style={{ gap: spacing.xs }}>
                <TextInput
                  value={telefoneEditado}
                  onChangeText={setTelefoneEditado}
                  placeholder="Telefone"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancelar" variant="secondary" onPress={() => setEditandoTelefoneId(null)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Salvar" onPress={() => salvarTelefone(item.id)} loading={salvandoTelefone} />
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.meta}>
                {item.usuario.telefone ? `Telefone: ${item.usuario.telefone}` : "Telefone não cadastrado"}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: spacing.lg }}>
              <Text
                style={styles.acaoPrimaria}
                onPress={() => navigation.navigate("FuncionarioHorarios", { funcionarioId: item.id, nome: item.usuario.nome })}
              >
                Horários e folgas
              </Text>
              {editandoTelefoneId !== item.id && (
                <Text style={styles.acaoSecundaria} onPress={() => iniciarEdicaoTelefone(item)}>
                  Editar telefone
                </Text>
              )}
              <Text style={styles.acaoSecundaria} onPress={() => alternarAtivo(item)}>
                {item.ativo ? "Desativar" : "Ativar"}
              </Text>
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  usage: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  addButton: { color: colors.accent, fontWeight: "700" },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  formTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 12, color: colors.inkMuted },
  name: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  meta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  acaoPrimaria: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  acaoSecundaria: { color: colors.inkMuted, fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
  },
});
