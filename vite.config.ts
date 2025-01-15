/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-default-export */
import { defineConfig } from "vite";
import { resolve } from "path";

const name = "core";

module.exports = defineConfig({
  resolve: { alias: { src: resolve("src/") } },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name,
      fileName: (format) => `${name}.${format}.js`,
    },
  },
});
