export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      deposits: {
        Row: {
          amount: number
          created_at: string
          id: string
          reviewed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pool: {
        Row: {
          fees_to_stakers: number
          id: number
          platform_revenue: number
          total_assets: number
          total_reserved: number
          total_shares: number
        }
        Insert: {
          fees_to_stakers?: number
          id?: number
          platform_revenue?: number
          total_assets?: number
          total_reserved?: number
          total_shares?: number
        }
        Update: {
          fees_to_stakers?: number
          id?: number
          platform_revenue?: number
          total_assets?: number
          total_reserved?: number
          total_shares?: number
        }
        Relationships: []
      }
      profile_challenges: {
        Row: {
          created_at: string
          user_id: string
          verify_phrase: string
        }
        Insert: {
          created_at?: string
          user_id: string
          verify_phrase: string
        }
        Update: {
          created_at?: string
          user_id?: string
          verify_phrase?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          borrowed: number
          closed_at: string | null
          entry_price: number
          exit_price: number | null
          fee: number | null
          id: string
          leverage: number
          liq_price: number
          margin: number
          opened_at: string
          payout: number | null
          pnl: number | null
          qty: number
          reserved: number
          side: string
          status: string
          symbol: string
          user_id: string
        }
        Insert: {
          borrowed: number
          closed_at?: string | null
          entry_price: number
          exit_price?: number | null
          fee?: number | null
          id?: string
          leverage: number
          liq_price: number
          margin: number
          opened_at?: string
          payout?: number | null
          pnl?: number | null
          qty: number
          reserved: number
          side: string
          status?: string
          symbol: string
          user_id: string
        }
        Update: {
          borrowed?: number
          closed_at?: string | null
          entry_price?: number
          exit_price?: number | null
          fee?: number | null
          id?: string
          leverage?: number
          liq_price?: number
          margin?: number
          opened_at?: string
          payout?: number | null
          pnl?: number | null
          qty?: number
          reserved?: number
          side?: string
          status?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number
          created_at: string
          email: string | null
          id: string
          roblox_display_name: string | null
          roblox_user_id: number | null
          roblox_username: string
          verified: boolean
          verify_phrase: string
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          id: string
          roblox_display_name?: string | null
          roblox_user_id?: number | null
          roblox_username: string
          verified?: boolean
          verify_phrase: string
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          id?: string
          roblox_display_name?: string | null
          roblox_user_id?: number | null
          roblox_username?: string
          verified?: boolean
          verify_phrase?: string
        }
        Relationships: []
      }
      stakes: {
        Row: {
          deposited: number
          shares: number
          user_id: string
        }
        Insert: {
          deposited?: number
          shares?: number
          user_id: string
        }
        Update: {
          deposited?: number
          shares?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          id: string
          reviewed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_claim_admin: {
        Args: { _user: string }
        Returns: undefined
      }
      fn_request_deposit: {
        Args: { _amount: number; _user: string }
        Returns: undefined
      }
      fn_close_position: {
        Args: {
          _force_liq?: boolean
          _id: string
          _price: number
          _user: string
        }
        Returns: Json
      }
      fn_open_position: {
        Args: {
          _lev: number
          _margin: number
          _price: number
          _side: string
          _symbol: string
          _user: string
        }
        Returns: string
      }
      fn_request_withdraw: {
        Args: { _amount: number; _user: string }
        Returns: undefined
      }
      fn_review_deposit: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      fn_review_withdraw: {
        Args: { _id: string; _paid: boolean }
        Returns: undefined
      }
      fn_stake: { Args: { _amount: number; _user: string }; Returns: undefined }
      fn_unstake: {
        Args: { _amount: number; _user: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
