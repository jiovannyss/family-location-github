/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

function normalizeRecoveryUrl(confirmationUrl: string) {
  const appBaseUrl = 'https://family-location.glowter.com'
  const resetUrl = new URL('/reset-password', appBaseUrl)

  try {
    const original = new URL(confirmationUrl)
    const hashParams = original.hash.startsWith('#')
      ? new URLSearchParams(original.hash.slice(1))
      : new URLSearchParams()

    if (hashParams.get('access_token') && hashParams.get('refresh_token')) {
      if (!hashParams.get('type')) {
        hashParams.set('type', 'recovery')
      }
      resetUrl.hash = hashParams.toString()
      return resetUrl.toString()
    }

    const tokenHash = original.searchParams.get('token_hash')
    if (tokenHash) {
      resetUrl.searchParams.set('token_hash', tokenHash)
      resetUrl.searchParams.set('type', 'recovery')
      return resetUrl.toString()
    }

    const code = original.searchParams.get('code') ?? original.searchParams.get('token')
    if (code) {
      resetUrl.searchParams.set('code', code)
      resetUrl.searchParams.set('type', 'recovery')
      return resetUrl.toString()
    }
  } catch {
    return 'https://family-location.glowter.com/reset-password'
  }

  return 'https://family-location.glowter.com/reset-password'
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => {
  const normalizedConfirmationUrl = normalizeRecoveryUrl(confirmationUrl)

  return <Html lang="bg" dir="ltr">
    <Head>
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>Смяна на парола за {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Смяна на парола</Heading>
        <Text style={text}>
          Получихме заявка за смяна на паролата за акаунта Ви в {siteName}.
          Натиснете бутона по-долу, за да зададете нова парола.
        </Text>
        <Button style={button} href={normalizedConfirmationUrl}>
          Смени паролата
        </Button>
        <Text style={linkText}>
          Ако бутонът не се отваря, използвайте този линк:<br />
          <a href={normalizedConfirmationUrl} style={anchor}>{normalizedConfirmationUrl}</a>
        </Text>
        <Text style={footer}>
          Ако не сте поискали смяна на парола, може спокойно да игнорирате
          този имейл. Паролата Ви няма да бъде променена.
        </Text>
      </Container>
    </Body>
  </Html>
}

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(200, 25%, 15%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(200, 10%, 35%)',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const button = {
  backgroundColor: 'hsl(174, 58%, 39%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const linkText = {
  fontSize: '13px',
  color: 'hsl(200, 10%, 35%)',
  lineHeight: '1.6',
  margin: '20px 0 0',
  wordBreak: 'break-all' as const,
}
const anchor = {
  color: 'hsl(174, 58%, 39%)',
  textDecoration: 'underline',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0', lineHeight: '1.5' }
