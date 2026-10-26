import type { Locale } from "@kaja/shared/locale"
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components"
import { env } from "../core/env"
import type { Translate } from "../core/i18n"

/** Why a code is emailed: to sign in, to approve an email change from the current address, or to confirm the new one. */
export type CodePurpose = "signIn" | "changeEmail" | "newEmail"

/** A code can go to an address with no account yet (a sign-up, a new email), so it carries what a stored user would. */
export interface CodeEmailPayload {
  purpose: CodePurpose
  email: string
  name: string
  locale?: string | null
  otp: string
}

/** What every template renders with: the user's language and its strings. */
export type EmailLanguage = {
  locale: Locale
  t: Translate
}

// The web app's palette (apps/web/src/styles.css); emails take inline styles only, since Gmail drops most <style> rules.
const color = {
  bg: "#0d100c",
  surface: "#1a2016",
  inset: "#131711",
  border: "#37402f",
  fg: "#eef2e6",
  muted: "#9aa88f",
  neon: "#6ba85a",
  neonHi: "#8ec478"
}
const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace"

/** The web app's address, for the wordmark and footer links. */
const siteUrl = (env.WEB_PUBLIC_URL ?? env.CORS_ORIGIN).replace(/\/$/, "")

/** Every email's frame: the wordmark, a card holding `children`, and a footer; `preview` is the inbox list's snippet. */
export function EmailContainer({
  locale,
  preview,
  t,
  children
}: Readonly<{ locale: Locale; preview: string; t: Translate; children: React.ReactNode }>) {
  return (
    <Html lang={locale}>
      <Head>
        {/* Dark is the design, so clients shouldn't invert it */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "32px 12px", backgroundColor: color.bg, fontFamily: font, color: color.fg }}>
        <Container style={{ maxWidth: "480px", margin: "0 auto" }}>
          <Link href={siteUrl} style={{ display: "block", padding: "0 4px 16px", textDecoration: "none" }}>
            <span style={{ color: color.neon, fontSize: "22px", fontWeight: 800 }}>&gt;</span>
            <span style={{ color: color.fg, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" }}> kaja</span>
          </Link>
          <Section
            style={{
              backgroundColor: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: "14px",
              padding: "28px 28px 8px"
            }}
          >
            {children}
          </Section>
          <Text style={{ margin: "16px 4px 0", fontSize: "12px", lineHeight: "18px", color: color.muted }}>
            {t("email.footer")}{" "}
            <Link href={siteUrl} style={{ color: color.muted, textDecoration: "underline" }}>
              {siteUrl.replace(/^https?:\/\//, "")}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

/** The greeting at the top of the card. */
export function EmailHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Heading style={{ margin: "0 0 12px", fontSize: "22px", lineHeight: "30px", color: color.fg }}>{children}</Heading>
  )
}

/** A paragraph; `small` for asides such as "didn't ask for this?". */
export function EmailText({ small, children }: Readonly<{ small?: boolean; children: React.ReactNode }>) {
  return (
    <Text
      style={{
        margin: "0 0 20px",
        fontSize: small ? "13px" : "16px",
        lineHeight: small ? "20px" : "24px",
        color: small ? color.muted : color.fg
      }}
    >
      {children}
    </Text>
  )
}

/** A one-time code, big and spaced out so it reads (and copies) at a glance. */
export function EmailCode({ code }: Readonly<{ code: string }>) {
  return (
    <Section
      style={{
        margin: "0 0 20px",
        backgroundColor: color.inset,
        border: `1px solid ${color.border}`,
        borderRadius: "10px",
        padding: "18px 0",
        textAlign: "center"
      }}
    >
      <Text
        style={{
          margin: 0,
          fontFamily: mono,
          fontSize: "34px",
          lineHeight: "40px",
          fontWeight: 700,
          letterSpacing: "10px",
          // Letter spacing trails the last digit too; the same on the left keeps the code centred
          paddingLeft: "10px",
          color: color.neonHi
        }}
      >
        {code}
      </Text>
    </Section>
  )
}

/** A thin rule between the code and its aside. */
export function EmailRule() {
  return <Hr style={{ margin: "4px 0 20px", border: "none", borderTop: `1px solid ${color.border}` }} />
}
