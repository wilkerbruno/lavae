import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";

interface SuporteInfo {
  emailSuporte: string | null;
  whatsappSuporte: string | null;
}

// Tela "Suporte", acessível a cliente, funcionário e dono do lava jato (cada
// um chegando aqui a partir do seu próprio menu/perfil). O e-mail é sempre o
// mesmo pra todo mundo; o WhatsApp só aparece pra quem pertence a uma
// lava jato cujo plano ATUAL tem atendimento prioritário — ver
// ConfiguracoesService.obterSuporte na API, que decide isso por trás do
// endpoint único /configuracoes/suporte (não tem lógica de papel aqui).
export function SuporteScreen() {
  const [info, setInfo] = useState<SuporteInfo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get<SuporteInfo>("/configuracoes/suporte");
      setInfo(data);
    } catch {
      setInfo(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function ligarPorEmail() {
    if (!info?.emailSuporte) return;
    Linking.openURL(`mailto:${info.emailSuporte}`).catch(() => {});
  }

  function abrirWhatsapp() {
    if (!info?.whatsappSuporte) return;
    const numero = info.whatsappSuporte.replace(/\D/g, "");
    Linking.openURL(`https://wa.me/${numero}`).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Suporte</Text>

      {carregando ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      ) : (
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          {!info?.emailSuporte && !info?.whatsappSuporte ? (
            <Text style={styles.vazio}>O suporte ainda não foi configurado. Tente novamente mais tarde.</Text>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {info?.emailSuporte && (
                <Pressable
                  style={[styles.item, info.whatsappSuporte ? styles.itemComBorda : null]}
                  onPress={ligarPorEmail}
                >
                  <View style={styles.itemIcone}>
                    <Ionicons name="mail-outline" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemLabel}>E-mail de suporte</Text>
                    <Text style={styles.itemValor}>{info.emailSuporte}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
                </Pressable>
              )}
              {info?.whatsappSuporte && (
                <Pressable style={styles.item} onPress={abrirWhatsapp}>
                  <View style={styles.itemIcone}>
                    <Ionicons name="logo-whatsapp" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemLabel}>WhatsApp (atendimento prioritário)</Text>
                    <Text style={styles.itemValor}>{info.whatsappSuporte}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
                </Pressable>
              )}
            </Card>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, padding: spacing.xl },
  vazio: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xl },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  itemComBorda: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemIcone: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: { fontSize: 12, fontWeight: "700", color: colors.inkMuted },
  itemValor: { fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: 2 },
});
