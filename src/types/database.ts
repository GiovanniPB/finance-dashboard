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
      attachments: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["attachment_entity_type"]
          file_name: string
          id: string
          mime_type: string
          notes: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["attachment_entity_type"]
          file_name: string
          id?: string
          mime_type: string
          notes?: string | null
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["attachment_entity_type"]
          file_name?: string
          id?: string
          mime_type?: string
          notes?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      bank_statement_lines: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          document_ref?: string | null
          fit_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_source?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          posted_at: string
          raw?: Json
          status?: Database["public"]["Enums"]["statement_line_status"]
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          document_ref?: string | null
          fit_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_source?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          posted_at?: string
          raw?: Json
          status?: Database["public"]["Enums"]["statement_line_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
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
      company_access: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            referencedRelation: "v_bills"
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
      payroll_account_mappings: {
        Row: {
          account_id: string
          company_id: string
          component: Database["public"]["Enums"]["payroll_component"]
          cost_center_id: string | null
          created_at: string
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          company_id: string
          component: Database["public"]["Enums"]["payroll_component"]
          cost_center_id?: string | null
          created_at?: string
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          company_id?: string
          component?: Database["public"]["Enums"]["payroll_component"]
          cost_center_id?: string | null
          created_at?: string
          employee_kind?: Database["public"]["Enums"]["employee_kind"]
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_account_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_account_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_account_mappings_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          benefits: number
          bonus_amount: number
          created_at: string
          employee_id: string
          employer_cost: number | null
          fgts: number
          fixed_amount: number
          gross_amount: number
          id: string
          inss: number
          irrf: number
          net_amount: number | null
          notes: string | null
          other_deductions: number
          payment_type: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id: string
          profit_sharing_amount: number
          updated_at: string
          variable_amount: number
        }
        Insert: {
          benefits?: number
          bonus_amount?: number
          created_at?: string
          employee_id: string
          employer_cost?: number | null
          fgts?: number
          fixed_amount?: number
          gross_amount: number
          id?: string
          inss?: number
          irrf?: number
          net_amount?: number | null
          notes?: string | null
          other_deductions?: number
          payment_type: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id: string
          profit_sharing_amount?: number
          updated_at?: string
          variable_amount?: number
        }
        Update: {
          benefits?: number
          bonus_amount?: number
          created_at?: string
          employee_id?: string
          employer_cost?: number | null
          fgts?: number
          fixed_amount?: number
          gross_amount?: number
          id?: string
          inss?: number
          irrf?: number
          net_amount?: number | null
          notes?: string | null
          other_deductions?: number
          payment_type?: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id?: string
          profit_sharing_amount?: number
          updated_at?: string
          variable_amount?: number
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
      tax_obligations: {
        Row: {
          amount_estimated: number
          amount_paid: number
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_estimated?: number
          amount_paid?: number
          base_amount?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          rate_pct?: number | null
          reference_period: string
          status?: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_estimated?: number
          amount_paid?: number
          base_amount?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          rate_pct?: number | null
          reference_period?: string
          status?: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_obligations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
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
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          notes: string | null
          paid_amount: number
          parent_id: string | null
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
          discount_amount?: number
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number
          id?: string
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number
          metadata?: Json
          notes?: string | null
          paid_amount?: number
          parent_id?: string | null
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
          discount_amount?: number
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number
          id?: string
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number
          metadata?: Json
          notes?: string | null
          paid_amount?: number
          parent_id?: string | null
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
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_bills: {
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
          days_overdue: number | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          discount_amount: number | null
          document_ref: string | null
          due_date: string | null
          effective_status: string | null
          fine_amount: number | null
          id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number | null
          notes: string | null
          open_amount: number | null
          paid_amount: number | null
          parent_id: string | null
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
          days_overdue?: never
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          effective_status?: never
          fine_amount?: number | null
          id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          notes?: string | null
          open_amount?: never
          paid_amount?: number | null
          parent_id?: string | null
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
          days_overdue?: never
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          effective_status?: never
          fine_amount?: number | null
          id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          notes?: string | null
          open_amount?: never
          paid_amount?: number | null
          parent_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
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
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bills_aging: {
        Row: {
          bucket: string | null
          company_id: string | null
          count: number | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      _find_company_account: {
        Args: { p_code: string; p_company_id: string }
        Returns: string
      }
      advance_recurrence_date: {
        Args: {
          p_current: string
          p_day_of_month?: number
          p_frequency: string
        }
        Returns: string
      }
      approve_recurring_template: {
        Args: { p_template_id: string }
        Returns: string
      }
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
      backfill_recurring_template: {
        Args: { p_template_id: string; p_through_date?: string }
        Returns: number
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
      calculate_simples_anexo_iii: {
        Args: { p_period_revenue: number; p_rbt12: number }
        Returns: {
          amount_due: number
          deduction: number
          effective_rate: number
          nominal_rate: number
          period_revenue: number
          rbt12: number
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
      company_stats: {
        Args: never
        Returns: {
          bank_account_count: number
          company_id: string
          employee_count_active: number
          expense_ytd: number
          last_activity: string
          revenue_ytd: number
          tx_count: number
          tx_count_ytd: number
        }[]
      }
      compute_company_period_revenue: {
        Args: { p_company_id: string; p_reference_period: string }
        Returns: number
      }
      compute_company_rbt12: {
        Args: { p_company_id: string; p_reference_period: string }
        Returns: number
      }
      cost_center_analysis: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          cost_center_code: string
          cost_center_id: string
          cost_center_name: string
          expense: number
          margin_pct: number
          net: number
          revenue: number
          transaction_count: number
        }[]
      }
      counterparty_analysis: {
        Args: {
          p_company_id: string
          p_from: string
          p_kind?: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          avg_ticket: number
          counterparty_id: string
          counterparty_kind: string
          counterparty_name: string
          last_movement: string
          net: number
          total_inflow: number
          total_outflow: number
          transaction_count: number
        }[]
      }
      create_installments: {
        Args: {
          p_first_due?: string
          p_installments: number
          p_interval_days?: number
          p_template: Json
        }
        Returns: {
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
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          notes: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_payroll_run_with_active_employees: {
        Args: { p_company_id: string; p_reference_month: string }
        Returns: string
      }
      create_transaction_from_line: {
        Args: {
          p_account_id: string
          p_cost_center_id?: string
          p_counterparty_id?: string
          p_line_id: string
        }
        Returns: {
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
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          notes: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_chart_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      delete_employee: { Args: { p_employee_id: string }; Returns: undefined }
      delete_payroll_run: { Args: { p_run_id: string }; Returns: undefined }
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
      dre_comparison: {
        Args: {
          p_company_id: string
          p_period_a_from: string
          p_period_a_to: string
          p_period_b_from: string
          p_period_b_to: string
        }
        Returns: {
          account_id: string
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          sort_order: number
          total_a: number
          total_b: number
          variance_abs: number
          variance_pct: number
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
      forecast_cashflow_daily: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          day: string
          inflow_expected: number
          inflow_recurring: number
          outflow_expected: number
          outflow_recurring: number
          running_balance: number
        }[]
      }
      generate_recurring_transactions: {
        Args: { p_through_date?: string }
        Returns: {
          generated_count: number
          template_id: string
        }[]
      }
      generate_tax_obligations: {
        Args: { p_company_id: string; p_reference_period: string }
        Returns: {
          amount_estimated: number
          amount_paid: number
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tax_obligations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_company_access: { Args: { p_company_id: string }; Returns: boolean }
      ignore_statement_line: {
        Args: { p_line_id: string }
        Returns: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        SetofOptions: {
          from: "*"
          to: "bank_statement_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_financial_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
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
      mark_overdue_obligations: {
        Args: { p_company_id: string }
        Returns: number
      }
      mark_tax_paid: {
        Args: {
          p_account_id: string
          p_actual_amount?: number
          p_bank_account_id: string
          p_obligation_id: string
          p_paid_at: string
        }
        Returns: {
          amount_estimated: number
          amount_paid: number
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_obligations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_statement_line: {
        Args: { p_line_id: string; p_transaction_id: string }
        Returns: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        SetofOptions: {
          from: "*"
          to: "bank_statement_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      materialize_recurring_occurrence: {
        Args: { p_template_id: string }
        Returns: string
      }
      post_payroll_run: {
        Args: { p_default_account_id: string; p_run_id: string }
        Returns: {
          generated_count: number
          total_amount: number
        }[]
      }
      preview_payroll_posting: {
        Args: { p_run_id: string }
        Returns: {
          account_code: string
          account_name: string
          amount: number
          component: Database["public"]["Enums"]["payroll_component"]
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          employee_name: string
          has_mapping: boolean
        }[]
      }
      register_payment: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_discount?: number
          p_fine?: number
          p_interest?: number
          p_paid_at?: string
          p_transaction_id: string
        }
        Returns: {
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
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          notes: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      setup_payroll_mappings_defaults: {
        Args: { p_company_id: string }
        Returns: {
          account_id: string
          company_id: string
          component: Database["public"]["Enums"]["payroll_component"]
          cost_center_id: string | null
          created_at: string
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          id: string
          notes: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payroll_account_mappings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      suggest_match_candidates: {
        Args: { p_line_id: string; p_max?: number }
        Returns: {
          account_code: string
          account_name: string
          accrual_date: string
          amount: number
          cash_date: string
          counterparty_name: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          due_date: string
          score: number
          transaction_id: string
        }[]
      }
      unmatch_statement_line: {
        Args: { p_line_id: string }
        Returns: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        SetofOptions: {
          from: "*"
          to: "bank_statement_lines"
          isOneToOne: true
          isSetofReturn: false
        }
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
      attachment_entity_type:
        | "transaction"
        | "counterparty"
        | "company"
        | "payroll_run"
        | "employee"
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
      payroll_component:
        | "salary_fixed"
        | "salary_variable"
        | "salary_bonus"
        | "fgts"
        | "benefits"
        | "irrf_withheld"
        | "inss_withheld"
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
      statement_line_status: "unmatched" | "matched" | "created" | "ignored"
      tax_obligation_kind:
        | "das_simples"
        | "darf_irpj"
        | "darf_csll"
        | "darf_pis"
        | "darf_cofins"
        | "gps_inss"
        | "fgts"
        | "icms"
        | "iss"
        | "irrf_retencao"
        | "inss_retencao"
        | "custom"
      tax_obligation_status: "pending" | "paid" | "overdue" | "waived"
      transaction_direction: "inflow" | "outflow"
      transaction_status:
        | "scheduled"
        | "pending"
        | "settled"
        | "reconciled"
        | "canceled"
      user_role: "admin" | "editor" | "viewer" | "super_admin"
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
      attachment_entity_type: [
        "transaction",
        "counterparty",
        "company",
        "payroll_run",
        "employee",
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
      payroll_component: [
        "salary_fixed",
        "salary_variable",
        "salary_bonus",
        "fgts",
        "benefits",
        "irrf_withheld",
        "inss_withheld",
      ],
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
      statement_line_status: ["unmatched", "matched", "created", "ignored"],
      tax_obligation_kind: [
        "das_simples",
        "darf_irpj",
        "darf_csll",
        "darf_pis",
        "darf_cofins",
        "gps_inss",
        "fgts",
        "icms",
        "iss",
        "irrf_retencao",
        "inss_retencao",
        "custom",
      ],
      tax_obligation_status: ["pending", "paid", "overdue", "waived"],
      transaction_direction: ["inflow", "outflow"],
      transaction_status: [
        "scheduled",
        "pending",
        "settled",
        "reconciled",
        "canceled",
      ],
      user_role: ["admin", "editor", "viewer", "super_admin"],
    },
  },
} as const
