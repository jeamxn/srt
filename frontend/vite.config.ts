import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  ssr: {
    noExternal: ["antd", "@ant-design/icons", "@ant-design/cssinjs", "rc-util", "rc-picker", "rc-pagination"],
  },
  server: {
    host: true,
    port: 3000,
  },
});
