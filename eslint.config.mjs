import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This operator UI intentionally stages animation and external-feed state
      // from effects. The rule flags those event-driven transitions as if they
      // were derived render state, which they are not.
      "react-hooks/set-state-in-effect": "off",
      // The React 19 refs rule currently misclassifies event-handler closures
      // that call notifier helpers backed by refs as render-time ref reads.
      "react-hooks/refs": "off",
      // Overlay and operator images are runtime URLs (League Hub, local proxy,
      // or operator input). Raw img elements preserve OBS/local behavior and
      // avoid routing private workstation assets through an optimizer.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "work/**",
    "release/**",
    "outputs/**",
  ]),
]);

export default eslintConfig;
