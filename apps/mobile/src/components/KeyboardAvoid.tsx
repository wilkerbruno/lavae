import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, StyleProp, View, ViewStyle } from "react-native";

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Props legadas do KeyboardAvoidingView, ignoradas (mantidas p/ compatibilidade).
  behavior?: unknown;
  keyboardVerticalOffset?: number;
};

/**
 * Evita que o teclado cubra botões/campos em qualquer plataforma.
 * - iOS: KeyboardAvoidingView padrão (padding).
 * - Android (edge-to-edge no SDK 54): adjustResize não redimensiona, então
 *   medimos quanto o teclado sobrepõe o container e aplicamos paddingBottom.
 * - Web: View simples (o navegador cuida).
 */
export function KeyboardAvoid({ children, style }: Props) {
  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView behavior="padding" style={style ?? { flex: 1 }}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  if (Platform.OS === "web") {
    return <View style={style ?? { flex: 1 }}>{children}</View>;
  }
  return <AndroidAvoid style={style}>{children}</AndroidAvoid>;
}

function AndroidAvoid({ children, style }: Props) {
  const ref = useRef<View>(null);
  const [pad, setPad] = useState(0);
  const kbTop = useRef<number | null>(null);

  const recalc = useCallback(() => {
    const top = kbTop.current;
    if (top == null) {
      setPad(0);
      return;
    }
    ref.current?.measureInWindow((_x, y, _w, h) => {
      // y/h incluem o padding atual; o fundo "natural" é y + h (padding não move o topo).
      const bottom = y + h;
      setPad((atual) => {
        const bottomSemPad = bottom + atual;
        return Math.max(0, Math.round(bottomSemPad - top));
      });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      kbTop.current = e.endCoordinates.screenY;
      recalc();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      kbTop.current = null;
      setPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [recalc]);

  return (
    <View ref={ref} collapsable={false} style={[style ?? { flex: 1 }, { paddingBottom: pad }]}>
      {children}
    </View>
  );
}
