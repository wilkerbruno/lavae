import React, { useState } from "react";
import { StyleProp, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/tokens";

// Campo de senha com botãozinho de "olho" pra revelar o que foi digitado —
// reaproveitado em toda tela do app que peça senha (login, criar conta,
// cadastro de funcionário pelo lava jato).
interface PasswordInputProps extends Omit<TextInputProps, "secureTextEntry" | "style"> {
  style?: StyleProp<ViewStyle>;
}

export function PasswordInput({ style, ...rest }: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <View style={{ justifyContent: "center" }}>
      <TextInput {...rest} secureTextEntry={!visivel} style={[style, { paddingRight: 40 }]} />
      <TouchableOpacity
        onPress={() => setVisivel((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ position: "absolute", right: 12 }}
      >
        <Ionicons name={visivel ? "eye-off-outline" : "eye-outline"} size={18} color={colors.inkMuted} />
      </TouchableOpacity>
    </View>
  );
}
