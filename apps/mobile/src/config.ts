// Não usado mais pelo fluxo do cliente: agora ele escolhe o lava jato na Home
// (lista de lava jatos perto dele) em vez de o app estar fixo numa só — ver
// HomeScreen/LavaJatoDetailScreen. Mantido por enquanto por segurança, caso
// alguma outra parte do app ainda dependa de um lava jato "padrão".
export const LAVAJATO_ID = process.env.EXPO_PUBLIC_LAVAJATO_ID ?? "";
