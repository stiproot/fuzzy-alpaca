import tseslint from "typescript-eslint"

const sdkQuarantine = {
  name: "@alpacahq/alpaca-trade-api",
  message: "The Alpaca SDK may only be imported inside src/adapters/outbound/alpaca/ — go through the AlpacaClient port.",
}

const restrict = (patterns) => ({
  "no-restricted-imports": [
    "error",
    {
      paths: [sdkQuarantine],
      patterns,
    },
  ],
})

export default tseslint.config(
  { ignores: ["node_modules", "dist", "coverage"] },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
  },
  // SDK quarantine everywhere by default
  {
    files: ["**/*.ts"],
    rules: restrict([]),
  },
  // Hexagonal dependency rule: domain imports nothing from the outer rings
  {
    files: ["src/domain/**/*.ts"],
    rules: restrict([
      {
        group: ["**/ports/**", "**/application/**", "**/adapters/**", "**/config", "**/config.js"],
        message: "domain/ is the pure core — it must not import ports, application, adapters, or config.",
      },
    ]),
  },
  // ports may import only domain
  {
    files: ["src/ports/**/*.ts"],
    rules: restrict([
      {
        group: ["**/application/**", "**/adapters/**", "**/config", "**/config.js"],
        message: "ports/ may only depend on domain/.",
      },
    ]),
  },
  // application may import domain + ports (+ config), never adapters
  {
    files: ["src/application/**/*.ts"],
    rules: restrict([
      {
        group: ["**/adapters/**"],
        message: "application/ must not depend on adapters — depend on the port instead.",
      },
    ]),
  },
  // the driven Alpaca adapter is the one place the SDK may be imported
  {
    files: ["src/adapters/outbound/alpaca/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  }
)
