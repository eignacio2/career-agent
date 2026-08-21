import { notFound, ok, serverError } from "@/lib/http";
import { sendMail } from "@/lib/mail";
import { getDigest, markDigestSent } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const digest = getDigest(Number(id));
    if (!digest) return notFound("No such digest.");

    const delivery = await sendMail({
      to: digest.toEmail,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });

    markDigestSent(
      digest.id,
      delivery.transport === "smtp" && delivery.ok ? "sent" : delivery.ok ? "outbox" : "failed",
      delivery.transport,
      delivery.error ?? null,
    );

    return ok({ digest: getDigest(digest.id), message: delivery.detail });
  } catch (error) {
    return serverError(error);
  }
}
