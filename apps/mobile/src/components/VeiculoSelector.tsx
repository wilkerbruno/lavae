import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ROTULO_PORTE, Veiculo } from "@lavajato-app/shared";
import { Card } from "./Card";
import { VeiculoFormModal } from "./VeiculoFormModal";
import { colors, radius, spacing } from "../theme/tokens";

interface Props {
  veiculos: Veiculo[];
  selecionadoId?: string;
  onSelect: (veiculo: Veiculo) => void;
  // Chamado depois de cadastrar um veículo novo pelo próprio seletor (o pai
  // adiciona na lista e normalmente já seleciona).
  onCriado: (veiculo: Veiculo) => void;
}

// Escolha do veículo que será atendido (define o porte → preço e duração) —
// com atalho pra cadastrar um novo sem sair da tela.
export function VeiculoSelector({ veiculos, selecionadoId, onSelect, onCriado }: Props) {
  const [cadastrando, setCadastrando] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      {veiculos.length === 0 && (
        <Card>
          <Text style={styles.vazio}>Cadastre o seu veículo para ver o valor do serviço e agendar.</Text>
        </Card>
      )}

      {veiculos.map((v) => {
        const selecionado = v.id === selecionadoId;
        return (
          <Pressable key={v.id} onPress={() => onSelect(v)}>
            <Card style={[styles.linha, selecionado && styles.linhaSelecionada]}>
              <Ionicons name={v.porte === "MOTO" ? "bicycle" : "car-sport"} size={22} color={selecionado ? colors.accent : colors.inkMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nome}>{[v.marca, v.modelo, v.cor].filter(Boolean).join(" ")}</Text>
                <Text style={styles.meta}>
                  {v.placa} · {ROTULO_PORTE[v.porte]}
                </Text>
              </View>
              {selecionado && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
            </Card>
          </Pressable>
        );
      })}

      <Pressable onPress={() => setCadastrando(true)} hitSlop={8}>
        <Text style={styles.novo}>+ Cadastrar novo veículo</Text>
      </Pressable>

      <VeiculoFormModal
        visible={cadastrando}
        onClose={() => setCadastrando(false)}
        onSalvo={(v) => {
          setCadastrando(false);
          onCriado(v);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  vazio: { fontSize: 13, color: colors.inkMuted },
  linha: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg },
  linhaSelecionada: { borderColor: colors.accent, borderWidth: 2 },
  nome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  novo: { fontSize: 13, fontWeight: "700", color: colors.accent },
});
