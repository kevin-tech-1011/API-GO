import { App as AntdApp, ConfigProvider, theme } from 'antd'
import { useMemo } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Profile from './pages/Profile'
import History from './pages/History'
import Schedule from './pages/Schedule'
import Calendar from './pages/Calendar'
import Resume from './pages/Resume'
import UserManage from './pages/UserManage'
import Statistics from './pages/Statistics'
import AccountDetail from './pages/AccountDetail'
import Login from './pages/Login'
import PrivateRoute from './components/PrivateRoute'
import ManagerRoute from './components/ManagerRoute'
import NonAppUserRoute from './components/NonAppUserRoute'
import { AuthProvider } from './components/AuthContext'
import Layout from './components/Layout'
import { Provider } from 'react-redux'
import { ThemeProvider, useThemeMode } from './components/ThemeContext'

import store from './redux/store'
import { buttonTheme } from './theme/buttonTheme'

const AppBody = () => {
    const { isDark } = useThemeMode()
    const antdTheme = useMemo(
        () => ({
            algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
            token: {
                colorPrimary: '#2563eb',
                colorInfo: '#0284c7',
                colorSuccess: '#059669',
                colorWarning: '#d97706',
                colorError: '#e11d48',
                colorLink: '#0284c7',
                colorText: isDark ? 'rgb(226, 232, 240)' : 'rgb(51, 65, 85)',
                colorTextSecondary: isDark
                    ? 'rgb(148, 163, 184)'
                    : 'rgb(100, 116, 139)',
                borderRadius: 10,
                borderRadiusLG: 12,
                fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            },
            components: {
                Button: buttonTheme(isDark),
                Input: {
                    controlHeightLG: 44,
                },
                Table: {
                    headerBg: isDark
                        ? 'rgba(30, 41, 59, 0.95)'
                        : 'rgba(248, 250, 252, 0.96)',
                    headerColor: isDark
                        ? 'rgb(203, 213, 225)'
                        : 'rgb(71, 85, 105)',
                    headerSplitColor: isDark
                        ? 'rgb(51, 65, 85)'
                        : 'rgb(226, 232, 240)',
                    rowHoverBg: isDark
                        ? 'rgba(30, 41, 59, 0.75)'
                        : 'rgba(224, 242, 254, 0.55)',
                    borderColor: isDark
                        ? 'rgb(51, 65, 85)'
                        : 'rgb(241, 245, 249)',
                },
                Modal: {
                    borderRadiusLG: 16,
                },
            },
        }),
        [isDark]
    )

    return (
        <ConfigProvider theme={antdTheme}>
            <AntdApp>
                <BrowserRouter>
                    <AuthProvider>
                        <Provider store={store}>
                            <Layout>
                                <Routes>
                                    <Route
                                        path="/auth/login/manager"
                                        element={<Login manager />}
                                    />
                                    <Route
                                        path="/auth/login"
                                        element={<Login />}
                                    />
                                    <Route element={<PrivateRoute />}>
                                        <Route
                                            path="/history"
                                            element={<History />}
                                        />
                                        <Route element={<NonAppUserRoute />}>
                                            <Route path="/" element={<Home />} />
                                            <Route
                                                path="/profile"
                                                element={<Home />}
                                            />
                                            <Route
                                                path="/profile/new"
                                                element={<Profile />}
                                            />
                                            <Route
                                                path="/profile/:id"
                                                element={<Profile />}
                                            />
                                            <Route
                                                path="/resume/:id"
                                                element={<Resume />}
                                            />
                                            <Route element={<ManagerRoute />}>
                                                <Route
                                                    path="/schedule"
                                                    element={<Schedule />}
                                                />
                                                <Route
                                                    path="/calendar"
                                                    element={<Calendar />}
                                                />
                                                <Route
                                                    path="/temporary"
                                                    element={
                                                        <Navigate
                                                            to="/calendar"
                                                            replace
                                                        />
                                                    }
                                                />
                                            </Route>
                                            <Route
                                                path="/statistics"
                                                element={<Statistics />}
                                            />
                                            <Route
                                                path="/users"
                                                element={<UserManage />}
                                            />
                                            <Route
                                                path="/me"
                                                element={<AccountDetail />}
                                            />
                                        </Route>
                                    </Route>
                                    <Route>404 Page Not Found</Route>
                                </Routes>
                            </Layout>
                        </Provider>
                    </AuthProvider>
                </BrowserRouter>
            </AntdApp>
        </ConfigProvider>
    )
}

function App() {
    return (
        <ThemeProvider>
            <AppBody />
        </ThemeProvider>
    )
}

export default App
