import { Body, Controller, Headers, Post, Query } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  // Endpoint único que o Mercado Pago chama (configurado em "Suas
  // integrações" > sua aplicação > Webhooks) pra TODO evento — tanto da
  // assinatura SaaS (conta da plataforma) quanto de qualquer lava jato
  // conectada (marketplace). Público porque a autenticação real é a
  // assinatura HMAC do header x-signature, verificada dentro do service.
  @Public()
  @Post("pagamento")
  webhook(@Body() payload: unknown, @Query() query: Record<string, string>, @Headers() headers: Record<string, string>) {
    return this.webhooksService.processarEventoPagamento(payload, query, headers);
  }
}
