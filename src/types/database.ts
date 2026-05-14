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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_fields: string[] | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["bank_account_type"]
          agency: string | null
          bank_name: string
          company_id: string
          created_at: string
          id: string
          initial_balance: number
          initial_balance_date: string | null
          is_active: boolean
          nickname: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type: Database["public"]["Enums"]["bank_account_type"]
          agency?: string | null
          bank_name: string
          company_id: string
          created_at?: string
          id?: string
          initial_balance?: number
          initial_balance_date?: string | null
          is_active?: boolean
          nickname: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["bank_account_type"]
          agency?: string | null
          bank_name?: string
          company_id?: string
          created_at?: string
          id?: string
          initial_balance?: number
          initial_balance_date?: string | null
          is_active?: boolean
          nickname?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_balance_snapshots: {
        Row: {
          bank_account_id: string
          closing_balance: number
          created_at: string
          id: string
          is_reconciled: boolean
          notes: string | null
          opening_balance: number
          reference_month: string
          total_inflow: number
          total_outflow: number
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          closing_balance: number
          created_at?: string
          id?: string
          is_reconciled?: boolean
          notes?: string | null
          opening_balance: number
          reference_month: string
          total_inflow?: number
          total_outflow?: number
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          created_at?: string
          id?: string
          is_reconciled?: boolean
          notes?: string | null
          opening_balance?: number
          reference_month?: string
          total_inflow?: number
          total_outflow?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_balance_snapshots_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          below_the_line: boolean
          code: string
          company_id: string
          created_at: string
          dre_section: Database["public"]["Enums"]["dre_section"] | null
          id: string
          is_active: boolean
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          master_account_id: string | null
          name: string
          notes: string | null
          parent_id: string | null
          sign_hint: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          below_the_line?: boolean
          code: string
          company_id: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          master_account_id?: string | null
          name: string
          notes?: string | null
          parent_id?: string | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          below_the_line?: boolean
          code?: string
          company_id?: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind?: Database["public"]["Enums"]["account_kind"]
          master_account_id?: string | null
          name?: string
          notes?: string | null
          parent_id?: string | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_account_id_fkey"
            columns: ["master_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts_master: {
        Row: {
          below_the_line: boolean
          code: string
          created_at: string
          dre_section: Database["public"]["Enums"]["dre_section"] | null
          id: string
          is_active: boolean
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          notes: string | null
          organization_id: string
          parent_id: string | null
          sign_hint: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          below_the_line?: boolean
          code: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          notes?: string | null
          organization_id: string
          parent_id?: string | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          below_the_line?: boolean
          code?: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind?: Database["public"]["Enums"]["account_kind"]
          name?: string
          notes?: string | null
          organization_id?: string
          parent_id?: string | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_master_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts_master"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          brand_color: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_holding: boolean
          legal_name: string
          organization_id: string
          sort_order: number
          tax_regime: Database["public"]["Enums"]["company_tax_regime"]
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_holding?: boolean
          legal_name: string
          organization_id: string
          sort_order?: number
          tax_regime?: Database["public"]["Enums"]["company_tax_regime"]
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_holding?: boolean
          legal_name?: string
          organization_id?: string
          sort_order?: number
          tax_regime?: Database["public"]["Enums"]["company_tax_regime"]
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          kind: string | null
          metadata: Json
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: string | null
          metadata?: Json
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          base_salary: number
          company_id: string
          cost_center_id: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          email: string | null
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          full_name: string
          hire_date: string
          id: string
          is_partner: boolean
          metadata: Json
          notes: string | null
          role: string | null
          status: Database["public"]["Enums"]["employee_status"]
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          base_salary: number
          company_id: string
          cost_center_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          employee_kind?: Database["public"]["Enums"]["employee_kind"]
          full_name: string
          hire_date: string
          id?: string
          is_partner?: boolean
          metadata?: Json
          notes?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          base_salary?: number
          company_id?: string
          cost_center_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          employee_kind?: Database["public"]["Enums"]["employee_kind"]
          full_name?: string
          hire_date?: string
          id?: string
          is_partner?: boolean
          metadata?: Json
          notes?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          column_mapping: Json | null
          committed_count: number
          company_id: string
          created_at: string
          created_by: string | null
          error_log: Json | null
          failed_count: number
          filename: string
          id: string
          notes: string | null
          row_count: number
          source: string
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          column_mapping?: Json | null
          committed_count?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          error_log?: Json | null
          failed_count?: number
          filename: string
          id?: string
          notes?: string | null
          row_count?: number
          source?: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          column_mapping?: Json | null
          committed_count?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_log?: Json | null
          failed_count?: number
          filename?: string
          id?: string
          notes?: string | null
          row_count?: number
          source?: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          id: string
          import_batch_id: string
          is_valid: boolean
          parsed: Json | null
          raw_data: Json
          row_number: number
          transaction_id: string | null
          validation_errors: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_batch_id: string
          is_valid?: boolean
          parsed?: Json | null
          raw_data: Json
          row_number: number
          transaction_id?: string | null
          validation_errors?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          import_batch_id?: string
          is_valid?: boolean
          parsed?: Json | null
          raw_data?: Json
          row_number?: number
          transaction_id?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          default_currency: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          benefits: number
          created_at: string
          employee_id: string
          employer_cost: number | null
          fgts: number
          gross_amount: number
          id: string
          inss: number
          irrf: number
          net_amount: number | null
          notes: string | null
          other_deductions: number
          payment_type: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id: string
          updated_at: string
        }
        Insert: {
          benefits?: number
          created_at?: string
          employee_id: string
          employer_cost?: number | null
          fgts?: number
          gross_amount: number
          id?: string
          inss?: number
          irrf?: number
          net_amount?: number | null
          notes?: string | null
          other_deductions?: number
          payment_type: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id: string
          updated_at?: string
        }
        Update: {
          benefits?: number
          created_at?: string
          employee_id?: string
          employer_cost?: number | null
          fgts?: number
          gross_amount?: number
          id?: string
          inss?: number
          irrf?: number
          net_amount?: number | null
          notes?: string | null
          other_deductions?: number
          payment_type?: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          posted_at: string | null
          reference_month: string
          status: string
          total_benefits: number
          total_charges: number
          total_fixed: number
          total_variable: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          reference_month: string
          status?: string
          total_benefits?: number
          total_charges?: number
          total_fixed?: number
          total_variable?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          reference_month?: string
          status?: string
          total_benefits?: number
          total_charges?: number
          total_fixed?: number
          total_variable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      recurring_templates: {
        Row: {
          account_id: string
          amount: number
          auto_generate: boolean
          bank_account_id: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          interval_count: number
          is_active: boolean
          last_generated_date: string | null
          max_occurrences: number | null
          metadata: Json
          next_run_date: string
          start_date: string
          total_generated: number
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          auto_generate?: boolean
          bank_account_id?: string | null
          company_id: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          end_date?: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_date?: string | null
          max_occurrences?: number | null
          metadata?: Json
          next_run_date: string
          start_date: string
          total_generated?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          auto_generate?: boolean
          bank_account_id?: string | null
          company_id?: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_date?: string | null
          max_occurrences?: number | null
          metadata?: Json
          next_run_date?: string
          start_date?: string
          total_generated?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id: string | null
          cash_date: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          document_ref: string | null
          due_date: string | null
          id: string
          import_batch_id: string | null
          metadata: Json
          notes: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id?: string | null
          cash_date?: string | null
          company_id: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          document_ref?: string | null
          due_date?: string | null
          id?: string
          import_batch_id?: string | null
          metadata?: Json
          notes?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          account_id?: string
          accrual_date?: string
          amount?: number
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          document_ref?: string | null
          due_date?: string | null
          id?: string
          import_batch_id?: string | null
          metadata?: Json
          notes?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_import"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_payroll"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_recurring"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_transactions: {
        Row: {
          account_id: string | null
          accrual_date: string | null
          amount: number | null
          bank_account_id: string | null
          cash_date: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          document_ref: string | null
          due_date: string | null
          id: string | null
          import_batch_id: string | null
          metadata: Json | null
          notes: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          document_ref?: string | null
          due_date?: string | null
          id?: string | null
          import_batch_id?: string | null
          metadata?: Json | null
          notes?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          document_ref?: string | null
          due_date?: string | null
          id?: string | null
          import_batch_id?: string | null
          metadata?: Json | null
          notes?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_import"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_payroll"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_recurring"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transactions_signed: {
        Row: {
          account_id: string | null
          accrual_date: string | null
          amount: number | null
          bank_account_id: string | null
          cash_date: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          document_ref: string | null
          due_date: string | null
          id: string | null
          import_batch_id: string | null
          metadata: Json | null
          notes: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          signed_amount: number | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          document_ref?: string | null
          due_date?: string | null
          id?: string | null
          import_batch_id?: string | null
          metadata?: Json | null
          notes?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          signed_amount?: never
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          document_ref?: string | null
          due_date?: string | null
          id?: string | null
          import_batch_id?: string | null
          metadata?: Json | null
          notes?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          signed_amount?: never
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_import"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_payroll"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_recurring"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      audit_log_list: {
        Args: {
          p_changed_by?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_record_id?: string
          p_table_name?: string
          p_to?: string
        }
        Returns: {
          action: string
          changed_at: string
          changed_by: string
          changed_fields: string[]
          changer_email: string
          changer_name: string
          id: number
          new_data: Json
          old_data: Json
          record_id: string
          table_name: string
          total_count: number
        }[]
      }
      bank_balances: {
        Args: { p_company_id: string; p_reference_month: string }
        Returns: {
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank_account_id: string
          bank_name: string
          closing_balance: number
          nickname: string
        }[]
      }
      cashflow_daily: {
        Args: { p_company_id: string; p_end: string; p_start: string }
        Returns: {
          day: string
          inflow: number
          net: number
          outflow: number
        }[]
      }
      cashflow_monthly: {
        Args: { p_company_id: string; p_year: number }
        Returns: {
          inflow: number
          month_start: string
          net: number
          outflow: number
        }[]
      }
      commit_import_batch: {
        Args: { p_batch_id: string }
        Returns: {
          batch_status: string
          committed_count: number
          failed_count: number
        }[]
      }
      create_payroll_run_with_active_employees: {
        Args: { p_company_id: string; p_reference_month: string }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      company_stats: {
        Args: never
        Returns: {
          company_id: string
          tx_count: number
          tx_count_ytd: number
          revenue_ytd: number
          expense_ytd: number
          last_activity: string | null
          bank_account_count: number
          employee_count_active: number
        }[]
      }
      dre_by_company: {
        Args: { p_company_id: string; p_end: string; p_start: string }
        Returns: {
          account_id: string
          below_the_line: boolean
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          parent_id: string
          sign_hint: string
          sort_order: number
          total: number
        }[]
      }
      dre_consolidated: {
        Args: { p_end: string; p_organization_id: string; p_start: string }
        Returns: {
          below_the_line: boolean
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          master_id: string
          name: string
          parent_id: string
          sign_hint: string
          sort_order: number
          total: number
        }[]
      }
      expense_breakdown: {
        Args: {
          p_company_id?: string
          p_end?: string
          p_limit?: number
          p_organization_id?: string
          p_start?: string
        }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          is_other: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          total: number
        }[]
      }
      is_financial_user: { Args: never; Returns: boolean }
      kpi_dashboard: {
        Args: { p_company_id: string; p_year: number }
        Returns: {
          cash_generation: number
          cogs: number
          contribution_margin: number
          dividends: number
          effective_tax_rate_pct: number
          financial_result: number
          fixed_costs: number
          gross_margin_pct: number
          gross_revenue: number
          month_start: string
          net_margin_pct: number
          net_result: number
          net_revenue: number
          partner_bonus: number
          partner_reimbursement: number
          revenue_deductions: number
        }[]
      }
      kpi_dashboard_consolidated: {
        Args: { p_organization_id: string; p_year: number }
        Returns: {
          cash_generation: number
          cogs: number
          contribution_margin: number
          dividends: number
          effective_tax_rate_pct: number
          financial_result: number
          fixed_costs: number
          gross_margin_pct: number
          gross_revenue: number
          month_start: string
          net_margin_pct: number
          net_result: number
          net_revenue: number
          partner_bonus: number
          partner_reimbursement: number
          revenue_deductions: number
        }[]
      }
      post_payroll_run: {
        Args: { p_default_account_id: string; p_run_id: string }
        Returns: {
          generated_count: number
          total_amount: number
        }[]
      }
    }
    Enums: {
      account_kind:
        | "revenue"
        | "revenue_deduction"
        | "cogs"
        | "operating_expense"
        | "personnel_expense"
        | "financial_expense"
        | "financial_income"
        | "dividend"
        | "partner_bonus"
        | "partner_reimbursement"
        | "capital_movement"
        | "asset"
        | "liability"
        | "equity"
        | "tax_on_profit"
        | "summary"
      bank_account_type:
        | "checking"
        | "savings"
        | "cdb_automatic"
        | "cdb_daily"
        | "cdb_term"
        | "investment_fund"
        | "cash"
      company_tax_regime: "simples" | "lucro_presumido" | "lucro_real" | "mei"
      dre_section:
        | "gross_revenue"
        | "revenue_deductions"
        | "net_revenue"
        | "cogs"
        | "contribution_margin"
        | "fixed_costs"
        | "fixed_costs_personnel"
        | "fixed_costs_utilities"
        | "financial_result"
        | "net_result"
        | "profitability"
        | "capital_movements"
        | "cash_generation"
        | "balance_snapshot"
        | "applications"
        | "operational_data"
      employee_kind: "clt" | "pj" | "intern" | "partner"
      employee_status: "active" | "on_leave" | "terminated"
      import_status:
        | "uploaded"
        | "mapped"
        | "previewed"
        | "committed"
        | "failed"
      payroll_payment_type:
        | "fixed"
        | "variable"
        | "bonus"
        | "vacation"
        | "thirteenth"
        | "severance"
        | "adjustment"
      recurrence_frequency:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "yearly"
      transaction_direction: "inflow" | "outflow"
      transaction_status:
        | "scheduled"
        | "pending"
        | "settled"
        | "reconciled"
        | "canceled"
      user_role: "admin" | "editor" | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_kind: [
        "revenue",
        "revenue_deduction",
        "cogs",
        "operating_expense",
        "personnel_expense",
        "financial_expense",
        "financial_income",
        "dividend",
        "partner_bonus",
        "partner_reimbursement",
        "capital_movement",
        "asset",
        "liability",
        "equity",
        "tax_on_profit",
        "summary",
      ],
      bank_account_type: [
        "checking",
        "savings",
        "cdb_automatic",
        "cdb_daily",
        "cdb_term",
        "investment_fund",
        "cash",
      ],
      company_tax_regime: ["simples", "lucro_presumido", "lucro_real", "mei"],
      dre_section: [
        "gross_revenue",
        "revenue_deductions",
        "net_revenue",
        "cogs",
        "contribution_margin",
        "fixed_costs",
        "fixed_costs_personnel",
        "fixed_costs_utilities",
        "financial_result",
        "net_result",
        "profitability",
        "capital_movements",
        "cash_generation",
        "balance_snapshot",
        "applications",
        "operational_data",
      ],
      employee_kind: ["clt", "pj", "intern", "partner"],
      employee_status: ["active", "on_leave", "terminated"],
      import_status: ["uploaded", "mapped", "previewed", "committed", "failed"],
      payroll_payment_type: [
        "fixed",
        "variable",
        "bonus",
        "vacation",
        "thirteenth",
        "severance",
        "adjustment",
      ],
      recurrence_frequency: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "semiannual",
        "yearly",
      ],
      transaction_direction: ["inflow", "outflow"],
      transaction_status: [
        "scheduled",
        "pending",
        "settled",
        "reconciled",
        "canceled",
      ],
      user_role: ["admin", "editor", "viewer"],
    },
  },
} as const
