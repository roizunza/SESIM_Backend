import React from 'react';
import './KPICard.css';

const KPICard = ({ title, value, unit, trend, icon: Icon, color }) => {
  const isPositive = trend >= 0;
  
  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <h3 className="kpi-title">{title}</h3>
        <div className="kpi-icon-wrapper" style={{ backgroundColor: `${color}20`, color: color }}>
          <Icon size={20} />
        </div>
      </div>
      <div className="kpi-body">
        <div className="kpi-value-container">
          <span className="kpi-value">{value}</span>
          <span className="kpi-unit">{unit}</span>
        </div>
        <div className={`kpi-trend ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '↑' : '↓'} {Math.abs(trend)}%
          <span className="trend-text">vs último mes</span>
        </div>
      </div>
    </div>
  );
};

export default KPICard;
