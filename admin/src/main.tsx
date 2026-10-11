import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './styles.css';

dayjs.extend(customParseFormat);
dayjs.locale('vi');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: { colorPrimary: '#d4380d', borderRadius: 8, fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif" },
        components: { Layout: { bodyBg: '#f5f6f8' } },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
