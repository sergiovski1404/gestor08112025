import React, { useEffect, useState } from 'react';
import supabase, { isSupabaseConfigured } from './services/supabaseClient';

interface AuthGateProps {
  children: React.ReactNode;
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f7fa',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  borderRadius: 12,
  background: '#ffffff',
  boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
  padding: 24,
};

const titleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 4,
  color: '#172b4d',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b778c',
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #dfe1e6',
  borderRadius: 8,
  padding: '10px 12px',
  marginBottom: 12,
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  background: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  fontSize: 13,
  color: '#2563eb',
  marginTop: 12,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  background: '#fde7e9',
  color: '#991b1b',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  marginBottom: 12,
};

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [isPasswordResetMode, setIsPasswordResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const localOk = localStorage.getItem('auth_gate_ok') === 'true';
    if (!isSupabaseConfigured && localOk) {
      setAuthed(true);
      setLoading(false);
      return;
    }

    const checkSession = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        setAuthed(Boolean(data.session));
      } else {
        setAuthed(localOk);
      }
      setLoading(false);
    };
    checkSession();

    if (isSupabaseConfigured && supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordResetMode(true);
          setAuthed(false);
          setInfo('Recupere sua senha: informe uma nova senha abaixo.');
          setError(null);
          return;
        }
        setAuthed(Boolean(session));
      });
      return () => {
        sub.subscription.unsubscribe();
      };
    }
  }, []);

  const handleLoginSupabase = async () => {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError('Preencha e-mail e senha');
      return;
    }
    try {
      const res = await supabase!.auth.signInWithPassword({ email, password });
      if (res.error) {
        setError(res.error.message);
      } else {
        setAuthed(true);
      }
    } catch (e: any) {
      setError(e.message || 'Falha ao autenticar');
    }
  };

  const handleSignupSupabase = async () => {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError('Preencha e-mail e senha');
      return;
    }
    try {
      const { data, error } = await supabase!.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      // Dependendo das configurações, pode exigir verificação por e-mail
      if (!data.session) {
        setInfo('Conta criada! Verifique seu e-mail para confirmar e depois faça login.');
      } else {
        setAuthed(true);
      }
    } catch (e: any) {
      setError(e.message || 'Falha ao criar conta');
    }
  };

  const handleResetPasswordRequest = async () => {
    setError(null);
    setInfo(null);
    if (!email) {
      setError('Informe seu e-mail para recuperar a senha');
      return;
    }
    try {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setInfo('Enviamos um link de recuperação para seu e-mail. Abra-o e retorne aqui.');
    } catch (e: any) {
      setError(e.message || 'Falha ao solicitar recuperação de senha');
    }
  };

  const handleSubmitNewPassword = async () => {
    setError(null);
    setInfo(null);
    if (!newPassword || newPassword.length < 6) {
      setError('Defina uma nova senha com ao menos 6 caracteres');
      return;
    }
    try {
      const { data, error } = await supabase!.auth.updateUser({ password: newPassword });
      if (error) {
        setError(error.message);
        return;
      }
      setInfo('Senha atualizada! Faça login novamente.');
      setIsPasswordResetMode(false);
      setNewPassword('');
      await supabase!.auth.signOut();
    } catch (e: any) {
      setError(e.message || 'Falha ao atualizar senha');
    }
  };

  const handleLoginLocal = () => {
    setError(null);
    if (pin.trim() === '1234') {
      localStorage.setItem('auth_gate_ok', 'true');
      setAuthed(true);
    } else {
      setError('PIN inválido. Use 1234 para testes.');
    }
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('auth_gate_ok');
    setAuthed(false);
  };

  if (loading) {
    return (
      <div style={containerStyle}><div style={cardStyle}><div style={titleStyle}>Carregando…</div></div></div>
    );
  }

  if (!authed) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={titleStyle}>
            {isPasswordResetMode ? 'Recuperar senha' : isSignup ? 'Criar credenciais' : 'Acesso ao aplicativo'}
          </div>
          <div style={subtitleStyle}>
            {isSupabaseConfigured
              ? isPasswordResetMode
                ? 'Informe uma nova senha para sua conta'
                : (isSignup ? 'Cadastre e-mail e senha (Supabase Auth)' : 'Entre com sua conta (Supabase Auth)')
              : 'Modo local: use o PIN para entrar'}
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          {info && (
            <div style={{ ...errorStyle, background: '#e7f3ff', color: '#1e3a8a' }}>{info}</div>
          )}
          {isSupabaseConfigured ? (
            <>
              {isPasswordResetMode ? (
                <>
                  <input
                    style={inputStyle}
                    type="password"
                    placeholder="Nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button style={buttonStyle} onClick={handleSubmitNewPassword}>Atualizar senha</button>
                  <span style={linkStyle} onClick={() => setIsPasswordResetMode(false)}>Voltar ao login</span>
                </>
              ) : (
                <>
                  <input
                    style={inputStyle}
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    style={inputStyle}
                    type="password"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {isSignup ? (
                    <>
                      <button style={buttonStyle} onClick={handleSignupSupabase}>Criar conta</button>
                      <span style={linkStyle} onClick={() => setIsSignup(false)}>Já tenho conta</span>
                    </>
                  ) : (
                    <>
                      <button style={buttonStyle} onClick={handleLoginSupabase}>Entrar</button>
                      <span style={linkStyle} onClick={() => setIsSignup(true)}>Criar credenciais</span>
                      <span style={linkStyle} onClick={handleResetPasswordRequest}>Esqueci minha senha</span>
                    </>
                  )}
                  <span style={subtitleStyle}>Dica: verifique seu e-mail após criar a conta</span>
                </>
              )}
            </>
          ) : (
            <>
              <input
                style={inputStyle}
                type="password"
                placeholder="PIN de acesso (1234)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <button style={buttonStyle} onClick={handleLoginLocal}>Entrar</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>{children}</>
  );
};

export default AuthGate;
