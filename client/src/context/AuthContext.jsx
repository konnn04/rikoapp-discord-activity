import { createContext, useContext, useState, useEffect } from 'react'
import { exchangeToken } from '../services/api'
import { DiscordSDK } from "@discord/embedded-app-sdk";

const AuthContext = createContext(null)
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

let auth = null;

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('discord_token') || null)
    const [user, setUser] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [channelId, setChannelId] = useState(null)
    const [guildId, setGuildId] = useState(null)

    useEffect(() => {
        const initializeDiscordSDK = async () => {
            try {
                await discordSdk.ready();
            } catch (error) {
                console.error('Failed to initialize Discord SDK:', error);
            }
        };
        initializeDiscordSDK();
    }, []);

    const loginDiscordSDK = async () => {
        console.log("Logging in to Discord SDK...");
        const { code } = await discordSdk.commands.authorize({
            client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: [
                "identify",
                "guilds",
                "applications.commands"
            ],
        });
        const { access_token }  = await exchangeToken(code)

        auth = await discordSdk.commands.authenticate({
            access_token,
        });

        if (auth == null) {
            throw new Error("Authenticate command failed");
        }else{
            setIsLoading(false);
            setToken(access_token);
            setUser(auth?.user);
            setChannelId(discordSdk.channelId);
            setGuildId(discordSdk.guildId);
            localStorage.setItem('discord_token', access_token);
        }
    }

    const logout = () => {
        setToken(null)
        setUser(null)
        localStorage.removeItem('discord_token')
    }

    return (
        <AuthContext.Provider value={{
            token,
            user,
            isAuthenticated: !!token,
            isLoading,
            channelId,
            guildId,
            logout,
            loginDiscordSDK
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
