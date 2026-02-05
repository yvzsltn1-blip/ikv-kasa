import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle, Mail, UserPlus, LogIn } from 'lucide-react';
import { UserRole } from '../types';
import { auth } from '../firebase'; // Ana dizindeki firebase.ts dosyasından import ediyoruz
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

interface LoginScreenProps {
  onLogin: (role: UserRole) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); // Kayıt ol / Giriş yap geçişi için

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
        alert("Hesap başarıyla oluşturuldu!");
      } else {
        // --- GİRİŞ YAPMA ---
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
      }

      if (user) {
        // --- ADMIN KONTROLÜ ---
        // Buraya kendi email adresini yazmalısın. Sadece bu email 'admin' yetkisi alır.
        const adminEmail = "yvzsltn61@gmail.com"; 

        if (user.email === adminEmail) {
          onLogin('admin');
        } else {
          onLogin('user');
        }
      }

    } catch (err: any) {
      console.error(err);
      // Firebase hata kodlarını Türkçeye çevirelim
      let msg = "Bir hata oluştu: " + err.message;
      if (err.code === 'auth/invalid-email') msg = "Geçersiz e-posta adresi formatı.";
      if (err.code === 'auth/user-not-found') msg = "Bu e-posta ile kayıtlı kullanıcı bulunamadı.";
      if (err.code === 'auth/wrong-password') msg = "Şifre hatalı.";
      if (err.code === 'auth/email-already-in-use') msg = "Bu e-posta adresi zaten kullanımda.";
      if (err.code === 'auth/weak-password') msg = "Şifre çok zayıf (en az 6 karakter olmalı).";
      if (err.code === 'auth/invalid-credential') msg = "Giriş bilgileri hatalı.";
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[url('https://picsum.photos/1920/1080?grayscale&blur=4')] bg-cover bg-center flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      
      <div className="relative z-10 w-[92vw] md:w-full max-w-md animate-in fade-in zoom-in duration-500">

        {/* Kart Kutusu */}
        <div className="bg-slate-900/90 border-2 border-slate-600 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
          
          {/* Başlık */}
          <div className="bg-slate-800 p-6 text-center border-b-2 border-slate-700 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50"></div>
            <Shield size={48} className="mx-auto text-yellow-500 mb-2 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-wider font-serif">İKV KASA</h1>
            <p className="text-slate-400 text-xs uppercase tracking-[0.2em] mt-1">
              {isRegistering ? 'YENİ HESAP OLUŞTUR' : 'YÖNETİM PANELİ'}
            </p>
          </div>

          {/* Form */}
          <div className="p-8">
            <form onSubmit={handleAuth} className="space-y-6">
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">E-POSTA ADRESİ</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={18} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 pl-10 text-slate-200 outline-none focus:border-yellow-500 transition-all placeholder-slate-600"
                    placeholder="ornek@email.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">ŞİFRE</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={18} />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 pl-10 text-slate-200 outline-none focus:border-yellow-500 transition-all placeholder-slate-600"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-800 rounded p-2 flex items-start gap-2 text-red-200 text-sm animate-in slide-in-from-left-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className={`w-full font-bold py-3 rounded shadow-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                  ${isRegistering 
                    ? 'bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white border border-emerald-500/50' 
                    : 'bg-gradient-to-r from-yellow-700 to-yellow-600 hover:from-yellow-600 hover:to-yellow-500 text-black border border-yellow-500/50'
                  }`}
              >
                {loading ? (
                  <span className="animate-pulse">İşlem Yapılıyor...</span>
                ) : (
                  <>
                    {isRegistering ? 'KAYIT OL' : 'GİRİŞ YAP'} 
                    {isRegistering ? <UserPlus size={18} /> : <LogIn size={18} />}
                  </>
                )}
              </button>

              {/* Geçiş Butonu */}
              <div className="text-center pt-2">
                 <button 
                    type="button"
                    onClick={() => {
                        setIsRegistering(!isRegistering);
                        setError('');
                        setEmail('');
                        setPassword('');
                    }}
                    className="text-slate-400 hover:text-yellow-400 text-xs underline underline-offset-4 transition-colors"
                 >
                    {isRegistering 
                        ? 'Zaten bir hesabın var mı? Giriş yap' 
                        : 'Hesabın yok mu? Yeni hesap oluştur'}
                 </button>
              </div>
            </form>
          </div>
          
          <div className="bg-slate-950 p-2 text-center border-t border-slate-800">
             <span className="text-[10px] text-slate-600">Secure Cloud Inventory System v3.0</span>
          </div>

        </div>
      </div>
    </div>
  );
};