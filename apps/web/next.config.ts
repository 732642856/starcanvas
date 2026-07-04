import path from "node:path"
import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Keep both dev and build on webpack.
  // Turbopack currently panics when this workspace lives under a Chinese path.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  webpack: (config, { isServer }) => {
    // onnxruntime-node .node binaries must be external (native addon, not webpack-bundleable)
    config.externals = [...(config.externals || []), "onnxruntime-node", "@lancedb/lancedb"]

    // Ignore .node files from webpack processing (native addons)
    config.module?.rules?.push({
      test: /\.node$/,
      use: "ignore-loader",
    })

    // Suppress a known webpack warning from the Kokoro -> transformers.web.js chain.
    // This comes from third-party code and does not affect runtime behavior.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@huggingface[\\/]transformers[\\/]dist[\\/]transformers\.web\.js$/,
        message: /Accessing import\.meta directly is unsupported/,
      },
    ]

    return config
  },

  // Dynamic imports of native-only packages should use require() at runtime
  serverExternalPackages: ["kokoro-js", "@xenova/transformers", "onnxruntime-node", "@lancedb/lancedb"],
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "",
  project: process.env.SENTRY_PROJECT || "starcanvas-web",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
  // Suppress deprecation warnings pending official migration guide.
  // Sentry SDK warns about disableLogger, automaticVercelMonitors,
  // and missing instrumentation/global-error files.
  // These will be addressed in the next Sentry upgrade pass.
})
