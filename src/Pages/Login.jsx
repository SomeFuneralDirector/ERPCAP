import React, { useState } from 'react';
import LOGINBG1 from '../assets/LOGINBG1.JPG';
import IFLOGO from '../assets/IFLOGO.jpeg';
import logotry from '../assets/logo.jpg'
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';

function Login() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) =>{
     e.preventDefault();

    const {data, error} = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if(error){
      alert(error.message);
      return
    }

    const user = data.user;

    const {data: profile, error: profileError} = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile){
      alert("No role assigned to the user")
      return;
    }

    const roleRoutes = {
      admin: '/admin',
      marketing: '/marketing',
      sales: '/sales',
      inventory: '/inventory'
    };

    navigate(roleRoutes[profile.role] || '/')
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 font-poppins relative"
      style={{
        backgroundImage: `url(${LOGINBG1})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    > 
      <div className="w-full max-w-md relative z-10">
        
        <div className="bg-white/20 backdrop-blur-md rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/30">

          <div className="text-center">
            <img
              src={logotry}
              alt="logo"
              className="mx-auto h-20 w-20 sm:h-25 sm:w-25 rounded-full shadow-sm border-2 border-white/50 bg-white/30 transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-xl hover:border-red-500/70 cursor-pointer"
            />
            <h2 className="mt-4 text-2xl sm:text-3xl font-semibold text-red-700">
              Welcome Back
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Sign in to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-red-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray/500 placeholder-gray focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-red-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 w-full px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-red-500 text-gray/500 placeholder-gray focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-red-600/90 backdrop-blur-sm text-white font-semibold hover:bg-red-700 transition-all duration-300 ease-in-out hover:scale-105 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer border border-white/20"
            >
              Sign In
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default Login;