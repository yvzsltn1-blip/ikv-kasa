import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { UserRole } from '../types';

interface LoginScreenProps {
  onLogin: (role: UserRole) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulated API call delay
    setTimeout(() => {
      if (username === 'admin' && password === '1234') {
        onLogin('admin');
      } else if (username === 'user' && password === '1234') {
        onLogin('user');
      } else {
        setError('Kullanıcı adı veya şifre hatalı!');
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="h-screen w-screen bg-[url('https://picsum.photos/1920/1080?grayscale&blur=4')] bg-cover bg-center flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      
      <div className="relative z-10 w-[92vw] md:w-full max-w-md animate-in fade-in zoom-in duration-500">

        {/* Card Container */}
        <div className="bg-slate-900/90 border-2 border-slate-600 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
          
          {/* Header */}
          <div className="bg-slate-800 p-6 text-center border-b-2 border-slate-700 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50"></div>
            <Shield size={48} className="mx-auto text-yellow-500 mb-2 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-wider font-serif">RPG INVENTORY</h1>
            <p className="text-slate-400 text-xs uppercase tracking-[0.2em] mt-1">Yönetim Paneli</p>
          </div>

          {/* Form */}
          <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 ml-1">KULLANICI ADI</label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={18} />
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 pl-10 text-slate-200 outline-none focus:border-yellow-500 transition-all placeholder-slate-600"
                    placeholder="Kullanıcı adı giriniz"
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
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-800 rounded p-2 flex items-center gap-2 text-red-200 text-sm animate-in slide-in-from-left-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gradient-to-r from-yellow-700 to-yellow-600 hover:from-yellow-600 hover:to-yellow-500 text-black font-bold py-3 rounded shadow-lg border border-yellow-500/50 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="animate-pulse">Giriş Yapılıyor...</span>
                ) : (
                  <>
                    GİRİŞ YAP <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="text-center">
                 <p className="text-[10px] text-slate-500">
                    Admin: <span className="text-slate-400">admin / 1234</span> &nbsp;|&nbsp; 
                    User: <span className="text-slate-400">user / 1234</span>
                 </p>
              </div>
            </form>
          </div>
          
          <div className="bg-slate-950 p-2 text-center border-t border-slate-800">
             <span className="text-[10px] text-slate-600">Secure Inventory System v2.1</span>
          </div>

        </div>
      </div>
    </div>
  );
};