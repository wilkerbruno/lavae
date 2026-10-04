import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/tokens";

interface StarRatingProps {
  value: number; // média (pode ser fracionária, ex: 4.3) ou a nota escolhida
  totalAvaliacoes?: number; // se informado, mostra "4.3 (12)" ao lado das estrelas
  size?: number;
  onChange?: (nota: number) => void; // se informado, vira um seletor tocável de 1 a 5
}

// Exibição (e, opcionalmente, seleção) de estrelas — usada tanto pra mostrar a
// nota média de um lava jato quanto pro cliente escolher sua própria nota.
export function StarRating({ value, totalAvaliacoes, size = 16, onChange }: StarRatingProps) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((estrela) => {
        const preenchida = estrela <= Math.round(value);
        const icone = <Ionicons name={preenchida ? "star" : "star-outline"} size={size} color={colors.accent} />;
        return onChange ? (
          <Pressable key={estrela} onPress={() => onChange(estrela)} hitSlop={6}>
            {icone}
          </Pressable>
        ) : (
          <View key={estrela}>{icone}</View>
        );
      })}
      {totalAvaliacoes !== undefined && (
        <Text style={[styles.count, { fontSize: Math.max(11, size * 0.65) }]}>
          {value > 0 ? value.toFixed(1) : "Novo"}
          {totalAvaliacoes > 0 ? ` (${totalAvaliacoes})` : ""}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  count: { color: colors.inkMuted, fontWeight: "700", marginLeft: 4 },
});
