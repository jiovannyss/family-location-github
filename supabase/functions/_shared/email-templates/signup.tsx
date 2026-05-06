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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="bg" dir="ltr">
    <Head>
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>Потвърдете имейла си за {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Добре дошли в {siteName}!</Heading>
        <Text style={text}>
          Благодарим Ви за регистрацията. Моля, потвърдете имейл адреса си,
          като натиснете бутона по-долу:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Потвърди имейла
        </Button>
        <Text style={footer}>
          Ако не сте създавали акаунт, може спокойно да игнорирате този имейл.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0', lineHeight: '1.5' }
