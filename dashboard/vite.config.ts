import react from '@vitejs/plugin-react';
import {
  defineConfig,
} from 'vite';

/**
 * 필수 Dashboard 환경 변수 조회
 */
const getRequiredEnv = (
  name: string,
): string => {
  const value = process.env[name];

  if (
    value === undefined ||
    value.trim() === ''
  ) {
    throw new Error(
      `[dashboard-config] ${name} is required`,
    );
  }

  return value.trim();
};

/**
 * DASHBOARD_PORT 환경 변수 Port 변환
 */
const parsePort = (
  value: string,
): number => {
  const port = Number(value);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error(
      `[dashboard-config] DASHBOARD_PORT must be an integer between 1 and 65535. received=${value}`,
    );
  }

  return port;
};

const dashboardPort = parsePort(
  getRequiredEnv('DASHBOARD_PORT'),
);

const backendUrl = getRequiredEnv(
  'DASHBOARD_BACKEND_URL',
);

export default defineConfig({
  plugins: [
    react(),
  ],

  server: {
    host: '0.0.0.0',
    port: dashboardPort,

    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },

      '/ws': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});