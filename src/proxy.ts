import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-cek-blok-ganti-di-produksi'
)

async function getPayload(req: NextRequest) {
  const t = req.cookies.get('cb_session')?.value
  if (!t) return null
  try {
    const { payload } = await jwtVerify(t, secret)
    return payload
  } catch {
    return null
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const s = await getPayload(req)

  if (pathname.startsWith('/dashboard') && !s) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname === '/login' && s) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = s ? '/dashboard' : '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login', '/dashboard/:path*'],
}
