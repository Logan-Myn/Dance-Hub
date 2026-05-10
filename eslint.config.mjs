import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
    globalIgnores(["**/node_modules", "**/.next", "**/build", "**/dist"]),
    ...nextCoreWebVitals,
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-interface": "off",
            "@typescript-eslint/no-unused-vars": "warn",
        },
    },
    {
        rules: {
            "react/no-unescaped-entities": "off",
            "@next/next/no-img-element": "off",
        },
    },
]);
