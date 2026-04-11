export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:32206',
  storage: {
    type: process.env.STORAGE_TYPE ?? 'local',
    awsS3Bucket: process.env.AWS_S3_BUCKET,
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
  },
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY,
  },
  tilda: {
    webhookSecret: process.env.TILDA_WEBHOOK_SECRET,
  },
  payment: {
    halyk: {
      clientId: process.env.HALYK_CLIENT_ID,
      clientSecret: process.env.HALYK_CLIENT_SECRET,
      terminalId: process.env.HALYK_TERMINAL_ID,
    },
    kaspi: {
      aipayApiKey: process.env.KASPI_AIPAY_API_KEY,
    },
    freedom: {
      merchantId: process.env.FREEDOM_MERCHANT_ID,
      secretKey: process.env.FREEDOM_SECRET_KEY,
    },
    platformFeePercent: parseInt(
      process.env.PLATFORM_FEE_PERCENT ?? '8',
      10,
    ),
  },
});
