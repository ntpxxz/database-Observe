'use client';
import React, { FC } from "react";
import {
  Bell,
  Search,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  RefreshCw,
  HelpCircle,
  Menu,
  LayoutDashboard,
} from "lucide-react";
import { DatabaseInventory } from "@/types";

interface NavbarProps {
  activeServer: DatabaseInventory | null;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentPage?: string;
}

export const Navbar: FC<NavbarProps> = ({
  activeServer,
  isSidebarCollapsed,
  onToggleSidebar,
  currentPage = "Database Inventory",
}) => {
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(true);
  const [notifications, setNotifications] = React.useState(3);

  const handleProfileToggle = () => {
    setIsProfileOpen(!isProfileOpen);
  };

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  // Get breadcrumb based on active server
  const getBreadcrumb = () => {
    if (activeServer) {
      return (
        <div className="flex items-center space-x-2 text-sm">
          <span className="text-slate-400">Database Inventory</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-300">{activeServer.systemName}</span>
          <span className="text-slate-500">/</span>
          <span className="text-white font-medium">SQL Query</span>
        </div>
      );
    }
    return (
      <div className="text-sm">
        <span className="text-white font-medium">{currentPage}</span>
      </div>
    );
  };

  return (
    <nav className={`bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between transition-all duration-300`}>
      {/* Left Section - Logo/Title & Menu Button */}
      <div className="flex items-center space-x-4">
        {/* Menu button for collapsed sidebar */}
        {isSidebarCollapsed && (
          <button
            onClick={onToggleSidebar}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Expand sidebar"
          >
            <Menu size={20} />
          </button>
        )}
        
        {/* Logo and Title - only show when sidebar is collapsed */}
        {isSidebarCollapsed && (
          <div className="flex items-center space-x-3">
            <LayoutDashboard className="text-sky-400" size={28} />
            <h1 className="text-xl font-bold text-white">SQL HUB</h1>
          </div>
        )}
        
        {/* Breadcrumb - only show when sidebar is expanded */}
        {!isSidebarCollapsed && (
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-white">
              {activeServer ? activeServer.systemName : currentPage}
            </h1>
            {getBreadcrumb()}
          </div>
        )}
      </div>

      {/* Center Section - Search (optional) */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search databases, tables, queries..."
            className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Right Section - Actions & Profile */}
      <div className="flex items-center space-x-3">
        {/* Server Status (if server is selected) */}
        {activeServer && (
          <div className="hidden sm:flex items-center space-x-2 px-3 py-2 bg-slate-700 rounded-lg">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-300">Connected</span>
          </div>
        )}

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={handleThemeToggle}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Toggle theme"
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Help */}
        <button
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Help"
        >
          <HelpCircle size={18} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Notifications"
          >
            <Bell size={18} />
            {notifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-xs text-white rounded-full w-5 h-5 flex items-center justify-center">
                {notifications}
              </span>
            )}
          </button>
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={handleProfileToggle}
            className="flex items-center space-x-2 p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <span className="hidden sm:block text-sm font-medium">Admin</span>
            <ChevronDown size={14} className={`transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Profile Dropdown Menu */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-700">
                <p className="text-sm font-medium text-white">Administrator</p>
                <p className="text-xs text-slate-400">admin@sqlhub.com</p>
              </div>
              
              <button className="w-full flex items-center px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                <User size={16} className="mr-3" />
                Profile
              </button>
              
              <button className="w-full flex items-center px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                <Settings size={16} className="mr-3" />
                Settings
              </button>
              
              <div className="border-t border-slate-700 mt-2 pt-2">
                <button className="w-full flex items-center px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors">
                  <LogOut size={16} className="mr-3" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close profile dropdown */}
      {isProfileOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsProfileOpen(false)}
        />
      )}
    </nav>
  );
};