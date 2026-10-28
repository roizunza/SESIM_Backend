import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Navbar from './Navbar';
import Footer from './Footer';
import Underfooter from './Underfooter';
import './Plataforma.css';

const Plataforma = () => {
  return (
    <div className="app-container">
      <Header />
      <Navbar />
      <main className="page-content">
        <Outlet />
      </main>
      <Footer />
      <Underfooter />
    </div>
  );
};

export default Plataforma;
