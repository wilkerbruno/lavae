import React from "react";
import { StyleSheet, Text } from "react-native";
import { centavosParaReais } from "@lavajato-app/shared";
import { colors } from "../theme/tokens";

export function PriceTag({ centavos, size = 15 }: { centavos: number; size?: number }) {
  return <Text style={[styles.text, { fontSize: size }]}>{centavosParaReais(centavos)}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontWeight: "800",
    color: colors.ink,
  },
});
