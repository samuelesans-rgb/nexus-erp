import "server-only";

/**
 * Canale di allarme operativo.
 *
 * Modellato sul provider email, con una differenza deliberata: qui il caso
 * "non configurato" NON si comporta come un invio riuscito.
 *
 * getEmailProvider() ripiega su un Noop che scrive SKIPPED e restituisce
 * successo. E' il motivo per cui in produzione nessuna email di prenotazione e'
 * mai partita senza che nessuno se ne accorgesse. Per un sistema d'allarme
 * quello stesso comportamento sarebbe il difetto peggiore possibile: un
 * sorvegliante convinto di averti avvisato. Quindi qui, se il canale non e'
 * configurato, `getAlertNotifier()` restituisce null e il chiamante lo registra
 * esplicitamente come NOT_CONFIGURED.
 */

export type AlertMessage = { title: string; body: string };
export type AlertDelivery = { provider: "telegram"; id?: string };

export interface AlertNotifier {
  readonly name: "telegram";
  send(message: AlertMessage): Promise<AlertDelivery>;
}

class TelegramNotifier implements AlertNotifier {
  readonly name = "telegram" as const;
  constructor(
    private readonly token: string,
    private readonly chatId: string,
  ) {}

  async send(message: AlertMessage): Promise<AlertDelivery> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.token}/sendMessage`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: `${message.title}\n\n${message.body}`,
          disable_notification: false,
        }),
      },
    );
    const body = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    // Telegram risponde 200 anche su errore applicativo: l'esito vero e' `ok`.
    if (!response.ok || !body.ok)
      throw new Error(
        `telegram:${response.status}:${body.description ?? "invio non riuscito"}`,
      );
    return { provider: "telegram", id: String(body.result?.message_id ?? "") };
  }
}

/** null quando il canale non e' configurato: il silenzio dev'essere visibile. */
export function getAlertNotifier(): AlertNotifier | null {
  const token = process.env.KITCHEN_ALERT_TELEGRAM_TOKEN,
    chatId = process.env.KITCHEN_ALERT_TELEGRAM_CHAT_ID;
  return token && chatId ? new TelegramNotifier(token, chatId) : null;
}
