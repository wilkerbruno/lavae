import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LavaJatoProxima } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StarRating } from "../../components/StarRating";
import { colors, spacing } from "../../theme/tokens";
import { NearbyStackParamList } from "../../navigation/NearbyStack";

type Props = NativeStackScreenProps<NearbyStackParamList, "Nearby">;
type Estado = "carregando" | "sem-permissao" | "erro" | "pronto";

// Tela "Perto de você": pede a localização atual do cliente e lista as
// lava jatos cadastradas na plataforma dentro de um raio, ordenadas por
// distância — cada uma já mostrando a nota média (estrelas).
export function NearbyScreen({ navigation }: Props) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [lavaJatos, setLavaJatos] = useState<LavaJatoProxima[]>([]);

  const buscar = useCallback(async () => {
    setEstado("carregando");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setEstado("sem-permissao");
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { data } = await api.get<LavaJatoProxima[]>("/lavajatos/proximas", {
        params: { lat: posicao.coords.latitude, lng: posicao.coords.longitude, raioKm: 30 },
      });
      setLavaJatos(data);
      setEstado("pronto");
    } catch {
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  if (estado === "carregando") {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (estado === "sem-permissao" || estado === "erro") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.mensagem}>
          {estado === "sem-permissao"
            ? "Precisamos da sua localização pra mostrar os lava jatos mais perto de você."
            : "Não foi possível buscar sua localização agora. Verifique o GPS e tente de novo."}
        </Text>
        <Button label="Tentar novamente" onPress={buscar} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={lavaJatos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.mensagem}>Nenhuma lava jato cadastrado perto de você ainda.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("LavaJatoDetail", { lavaJatoId: item.id, nome: item.nome })}
          >
            <Card style={{ marginBottom: spacing.sm, gap: spacing.xs }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={styles.nome}>{item.nome}</Text>
                  {item.endereco && <Text style={styles.endereco}>{item.endereco}</Text>}
                </View>
                <Text style={styles.distancia}>
                  {item.distanciaKm < 1 ? `${Math.round(item.distanciaKm * 1000)} m` : `${item.distanciaKm.toFixed(1)} km`}
                </Text>
              </View>
              <StarRating value={item.notaMedia} totalAvaliacoes={item.totalAvaliacoes} size={14} />
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  list: { padding: spacing.xl },
  mensagem: { color: colors.inkMuted, fontSize: 14, textAlign: "center" },
  nome: { fontSize: 15, fontWeight: "800", color: colors.ink },
  endereco: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  distancia: { fontSize: 12, fontWeight: "700", color: colors.accent },
});
