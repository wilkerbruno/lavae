import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// Uso: @Public() em cima de rotas que não exigem login (ex: login, catálogo público).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
