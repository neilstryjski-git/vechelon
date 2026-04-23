/**
 * Resend Transactional Email Provider
 * Fulfills W63: Wire up Resend as SMTP provider for transactional email.
 */

export const sendResendEmail = async (params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) => {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { error: 'RESEND_API_KEY not set' };
  }

  const from = params.from || 'Vechelon <notifications@vechelon.ca>';
  
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend API Error:', JSON.stringify(data));
      throw new Error(data.message || data.error?.message || 'Failed to send email via Resend');
    }

    return { data };
  } catch (error) {
    console.error('Resend Error:', error);
    return { error: error.message };
  }
};
