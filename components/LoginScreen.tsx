import React, { useState } from 'react';
import { Shield, Lock, AlertCircle, Mail, UserPlus, LogIn, Chrome } from 'lucide-react';
import { UserRole } from '../types';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface LoginScreenProps {
  onLogin: (role: UserRole) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // E-posta & Şifre ile Giriş/Kayıt
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let user;

      if (isRegistering) {
        // --- KAYIT OLMA ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        
        // E-posta Doğrulama Linki Gönder
        await sendEmailVerification(user);
        
        // ÖNEMLİ: Kayıt olur olmaz oturumu kapatıyoruz ki direkt girmesin.
        await signOut(auth);
        
        alert("Hesap başarıyla oluşturuldu! Lütfen e-posta adresinize (Gereksiz/Spam kutusu dahil) gönderilen doğrulama linkine tıklayın ve ardından giriş yapın.");
        
        setIsRegistering(false); // Giriş ekranına geri döndür
        setLoading(false);
        return; // Fonksiyonu burada kesiyoruz, checkUserRole çalışmasın

      } else {
        // --- GİRİŞ YAPMA ---
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        user = userCredential.user;

        // --- GÜVENLİK KONTROLÜ ---
        await user.reload();
        const refreshedUser = auth.currentUser;
        if (!refreshedUser?.emailVerified) {
            await signOut(auth); // Kullanıcıyı sistemden at
            setError("Giriş yapabilmek için lütfen e-posta adresinize gönderilen linki doğrulayın.");
            setLoading(false);
            return; // İçeri alma
        }
        user = refreshedUser;
      }

      // Her şey yolundaysa rolü kontrol et
      await checkUserRole(user);

    } catch (err: any) {
      let msg = "Bir hata oluştu. Lütfen tekrar deneyin.";
      if (err.code === 'auth/invalid-email') msg = "Geçersiz e-posta adresi formatı.";
      else if (err.code === 'auth/user-not-found') msg = "Bu e-posta ile kayıtlı kullanıcı bulunamadı.";
      else if (err.code === 'auth/wrong-password') msg = "Şifre hatalı.";
      else if (err.code === 'auth/email-already-in-use') msg = "Bu e-posta adresi zaten kullanımda.";
      else if (err.code === 'auth/weak-password') msg = "Şifre çok zayıf (en az 6 karakter olmalı).";
      else if (err.code === 'auth/invalid-credential') msg = "Giriş bilgileri hatalı.";
      else if (err.code === 'auth/popup-closed-by-user') msg = "Giriş penceresi kapatıldı.";

      setError(msg);
      setLoading(false);
    }
  };

  // Şifremi Unuttum
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Lütfen önce e-posta adresinizi yazın, ardından 'Şifremi Unuttum' butonuna tıklayın.");
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. (Spam/Gereksiz klasörünü de kontrol edin)");
    } catch (err: any) {
      let msg = "Şifre sıfırlama sırasında bir hata oluştu.";
      if (err.code === 'auth/user-not-found') msg = "Bu e-posta ile kayıtlı kullanıcı bulunamadı.";
      else if (err.code === 'auth/invalid-email') msg = "Geçersiz e-posta adresi formatı.";
      setError(msg);
    }
    setLoading(false);
  };

  // Google ile Giriş
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      // Google hesapları doğrulandı sayılır, ekstra kontrole gerek yok
      await checkUserRole(result.user);
    } catch (err: any) {
      const msg = err.code === 'auth/popup-closed-by-user' ? "Giriş penceresi kapatıldı." : `Google ile giriş sırasında bir hata oluştu. (${err.code})`;
      setError(msg);
      setLoading(false);
    }
  };

  // Rol Kontrolü (Ortak Fonksiyon)
  const checkUserRole = async (user: any) => {
    if (user) {
      const adminEmail = "yvzsltn61@gmail.com";
      let isAdmin = user.email === adminEmail;

      if (!isAdmin) {
        try {
          const adminsDoc = await getDoc(doc(db, "metadata", "admins"));
          if (adminsDoc.exists()) {
            const emails: string[] = adminsDoc.data().emails || [];
            if (user.email && emails.includes(user.email.toLowerCase())) {
              isAdmin = true;
            }
          }
        } catch { /* admins doc may not exist */ }
      }

      onLogin(isAdmin ? 'admin' : 'user');
    }
  };

  return (
     <div className="min-h-[100dvh] w-screen flex items-center justify-center bg-slate-950 py-3 px-3 md:py-8 md:px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(234,179,8,0.04),transparent_70%)]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in duration-500">

        <div className="bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-700/50 rounded-2xl shadow-[0_8px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)_inset] overflow-hidden backdrop-blur-xl">

          <div className="bg-gradient-to-b from-slate-800/80 to-slate-800/40 px-6 py-3 md:px-8 md:py-5 text-center border-b border-slate-700/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent"></div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(234,179,8,0.08),transparent_70%)]"></div>
            <Shield size={32} className="mx-auto text-yellow-500 mb-1 md:mb-2 drop-shadow-[0_0_20px_rgba(234,179,8,0.4)] md:!w-10 md:!h-10" />
            <h1 className="text-lg md:text-xl font-semibold text-slate-100 tracking-[0.15em] font-serif">İKV KASA</h1>
            <p className="text-slate-500 text-[9px] md:text-[10px] uppercase tracking-[0.25em] mt-0.5 md:mt-1 font-medium">
              {isRegistering ? 'YENİ HESAP OLUŞTUR' : 'YÖNETİM PANELİ'}
            </p>
          </div>

          <div className="px-5 py-4 md:px-8 md:py-6">
            <form onSubmit={handleAuth} className="space-y-3 md:space-y-5">

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-500 ml-1 tracking-wider">E-POSTA ADRESİ</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-yellow-500/80 transition-colors duration-300" size={15} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 pl-9 md:p-3 md:pl-10 text-sm text-slate-200 outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all duration-300 placeholder-slate-600"
                    placeholder="ornek@email.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-500 ml-1 tracking-wider">ŞİFRE</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-yellow-500/80 transition-colors duration-300" size={15} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 pl-9 md:p-3 md:pl-10 text-sm text-slate-200 outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all duration-300 placeholder-slate-600"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {!isRegistering && (
                <div className="flex justify-end -mt-1 md:-mt-2">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-slate-500 hover:text-yellow-500/80 text-[10px] transition-colors duration-300 disabled:opacity-50"
                  >
                    Şifremi Unuttum
                  </button>
                </div>
              )}

              {error && (
                <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-2 flex items-start gap-2 text-red-300/90 text-xs animate-in slide-in-from-left-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full font-semibold text-sm py-2.5 md:py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all duration-300 transform hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                  ${isRegistering
                    ? 'bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white shadow-emerald-900/30'
                    : 'bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 text-slate-950 shadow-yellow-900/30'
                  }`}
              >
                {loading && !error ? (
                  <span className="animate-pulse">İşlem Yapılıyor...</span>
                ) : (
                  <>
                    {isRegistering ? 'KAYIT OL' : 'GİRİŞ YAP'}
                    {isRegistering ? <UserPlus size={16} /> : <LogIn size={16} />}
                  </>
                )}
              </button>

              {/* Google İle Giriş Butonu */}
              <div className="relative py-0.5 md:py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-800"></span></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider"><span className="bg-slate-900 px-3 text-slate-600">veya</span></div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-2 md:py-2.5 px-4 bg-slate-900/60 text-slate-400 text-xs font-medium rounded-lg border border-slate-800/80 flex items-center justify-center gap-2.5 hover:bg-slate-800/60 hover:text-slate-200 hover:border-slate-700 hover:scale-[1.01] hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {/* Mini Google Logo */}
                <div className="p-1 bg-slate-800/80 rounded-md group-hover:bg-slate-700 transition-colors duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="14px" height="14px">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                  </svg>
                </div>

                <span className="group-hover:text-slate-100 transition-colors duration-300">
                  Google ile devam et
                </span>
              </button>

              <div className="text-center">
                 <button
                    type="button"
                    onClick={() => {
                        setIsRegistering(!isRegistering);
                        setError('');
                        setEmail('');
                        setPassword('');
                    }}
                    className="text-slate-500 hover:text-yellow-500/80 text-[11px] underline underline-offset-4 decoration-slate-700 hover:decoration-yellow-500/50 transition-all duration-300"
                 >
                    {isRegistering
                        ? 'Zaten bir hesabın var mı? Giriş yap'
                        : 'Hesabın yok mu? Yeni hesap oluştur'}
                 </button>
              </div>
            </form>
          </div>

          <div className="bg-slate-950/60 px-4 py-1.5 md:py-2 text-center border-t border-slate-800/50">
             <span className="text-[9px] text-slate-600 tracking-wider">Secure Cloud Inventory System v3.1</span>
          </div>

        </div>
      </div>
    </div>
  );
};
