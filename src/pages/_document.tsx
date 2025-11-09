import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Basic Meta Tags */}
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta name="theme-color" content="#fef3c7" />

        {/* Essential Open Graph Meta Tags - Default for homepage only */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Tip Flow – Tip Your Audience" />
        <meta
          property="og:description"
          content="With Tip Flow you can boost your casts by tipping engagers for their interactions easily."
        />
        <meta
          property="og:image"
          content="https://Tip Flow.vercel.app/og-image.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:url" content="https://Tip Flow.vercel.app" />
        <meta property="og:site_name" content="Tip Flow" />
        <meta property="og:locale" content="en_US" />

        {/* Essential Twitter Card Meta Tags - Default for homepage only */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Tip Flow – Tip Your Audience" />
        <meta
          name="twitter:description"
          content="With Tip Flow you can boost your casts by tipping engagers for their interactions easily."
        />
        <meta
          name="twitter:image"
          content="https://Tip Flow.vercel.app/og-image.png"
        />

        {/* Farcaster Mini App Embed - Default for homepage only (overridden by share pages) */}
        <meta
          name="fc:miniapp"
          content='{"version":"1","imageUrl":"https://Tip Flow.vercel.app/og-image.png","button":{"title":"Start Tipping","action":{"type":"launch_frame","name":"Tip Flow","url":"https://Tip Flow.vercel.app","splashImageUrl":"https://Tip Flow.vercel.app/splash.png","splashBackgroundColor":"#fef3c7"}}}'
        />
        {/* For backward compatibility */}
        <meta
          name="fc:frame"
          content='{"version":"1","imageUrl":"https://Tip Flow.vercel.app/og-image.png","button":{"title":"Start Tipping","action":{"type":"launch_frame","name":"Tip Flow","url":"https://Tip Flow.vercel.app","splashImageUrl":"https://Tip Flow.vercel.app/splash.png","splashBackgroundColor":"#fef3c7"}}}'
        />

        {/* Basic Meta Tags */}
        <meta
          name="description"
          content="With Tip Flow you can boost your casts by tipping engagers for their interactions easily."
        />
        <meta
          name="keywords"
          content="tip, tipping, noice, Tip Flow, engage, farcaster, crypto, social"
        />
        <meta name="author" content="Tip Flow" />

        {/* Favicon */}
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />

        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://api.farcaster.xyz" />
        <link rel="preconnect" href="https://Tip Flow.vercel.app" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
