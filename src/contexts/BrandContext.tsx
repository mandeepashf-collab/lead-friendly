'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface BrandConfig {
  brandName: string
  brandColor: string
  brandLogo: string | null
  isWhiteLabel: boolean
  isImpersonating: boolean
  impersonatingSubAccountId: string | null
}

const defaultBrand: BrandConfig = {
  brandName: 'Lead Friendly',
  brandColor: '#6366f1',
  brandLogo: null,
  isWhiteLabel: false,
  isImpersonating: false,
  impersonatingSubAccountId: null,
}

const BrandContext = createContext<BrandConfig>(defaultBrand)

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandConfig>(defaultBrand)

  useEffect(() => {
    async function loadBrand() {
      const supabase = createClient()

      // Check if impersonating via cookie
      const token = document.cookie.match(/impersonation_token=([^;]+)/)?.[1]
      const subId = document.cookie.match(/impersonation_sub_account=([^;]+)/)?.[1]

      if (token && subId) {
        const { data: sub } = await supabase
          .from('sub_accounts')
          .select('company_name, primary_color, logo_url')
          .eq('id', subId)
          .single()

        if (sub) {
          setBrand({
            brandName: sub.company_name || 'Client Portal',
            brandColor: sub.primary_color || '#6366f1',
            brandLogo: sub.logo_url || null,
            isWhiteLabel: true,
            isImpersonating: true,
            impersonatingSubAccountId: subId,
          })
          return
        }
      }

      // Not impersonating — use default Lead Friendly branding
      setBrand(defaultBrand)
    }
    loadBrand()
  }, [])

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)
