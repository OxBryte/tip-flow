import { GetServerSideProps } from 'next';

// Dynamic image generation endpoint - renders share stats as custom image
// This follows the Next.js generateMetadata pattern for dynamic image rendering
// Called when share URL is embedded and needs to render as an image
export default function DynamicOGImage() {
  // This route generates SVG image via getServerSideProps
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { fid } = context.params as { fid: string };
  const { time = 'total', type = 'earnings' } = context.query as { time?: string; type?: 'earnings' | 'tippings' };
  
  try {
    // Fetch user stats and profile from backend with timeout
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://tippit-production.up.railway.app';
    
    // Use Promise.race to add timeout (10 seconds)
    const fetchWithTimeout = (url: string, timeout: number = 10000): Promise<Response> => {
      return Promise.race([
        fetch(url),
        new Promise<Response>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ]);
    };
    
    const [statsResponse, profileResponse] = await Promise.all([
      fetchWithTimeout(`${backendUrl}/api/user-earnings/${fid}`),
      fetchWithTimeout(`${backendUrl}/api/user-profile/${fid}`)
    ]);

    if (!statsResponse.ok || !profileResponse.ok) {
      context.res.statusCode = 404;
      context.res.end('User not found');
      return { props: {} };
    }

    const userStats = await statsResponse.json();
    const userProfile = await profileResponse.json();
    
    // Calculate amount
    let amount = 0;
    let timeLabel = '';
    
    switch (time) {
      case '24h':
        amount = type === 'earnings' ? userStats.earnings24h : userStats.tippings24h;
        timeLabel = '24h';
        break;
      case '7d':
        amount = type === 'earnings' ? userStats.earnings7d : userStats.tippings7d;
        timeLabel = '7d';
        break;
      case '30d':
        amount = type === 'earnings' ? userStats.earnings30d : userStats.tippings30d;
        timeLabel = '30d';
        break;
      case 'total':
      default:
        amount = type === 'earnings' ? userStats.totalEarnings : userStats.totalTippings;
        timeLabel = 'Total';
        break;
    }
    
    // Generate SVG image with bright yellow background
    // Use 1200x630 for better social media preview (standard OG image size)
    const displayName = (userProfile.displayName || userProfile.username || 'User')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const username = (userProfile.username || 'user')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const amountText = amount.toFixed(2);
    const actionText = type === 'earnings' ? 'Earned' : 'Tipped';
    const timeText = timeLabel;
    
    const avatarImage = userProfile.pfpUrl 
      ? `<image href="${userProfile.pfpUrl.replace(/"/g, '&quot;')}" x="50" y="215" width="200" height="200" clip-path="url(#avatarClip)"/>`
      : `<circle cx="150" cy="315" r="100" fill="#333"/>
         <text x="150" y="335" font-family="Arial, sans-serif" font-size="80" fill="#fff" text-anchor="middle" font-weight="bold">${(username[0] || 'U').toUpperCase()}</text>`;
    
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Bright yellow background -->
  <rect width="1200" height="630" fill="#FFD700"/>
  
  <!-- Avatar circle -->
  <defs>
    <clipPath id="avatarClip">
      <circle cx="150" cy="315" r="100"/>
    </clipPath>
  </defs>
  ${avatarImage}
  
  <!-- User name -->
  <text x="400" y="280" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="#000">${displayName}</text>
  <text x="400" y="330" font-family="Arial, sans-serif" font-size="36" fill="#333">@${username}</text>
  
  <!-- Amount - Large and prominent -->
  <text x="400" y="430" font-family="Arial, sans-serif" font-size="96" font-weight="bold" fill="#000">${amountText} USDC</text>
  
  <!-- Action text -->
  <text x="400" y="500" font-family="Arial, sans-serif" font-size="42" fill="#333">${actionText} in ${timeText}</text>
  
  <!-- Ecion branding -->
  <text x="1050" y="600" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#000">Ecion</text>
</svg>`;
    
    // Return SVG as image
    context.res.setHeader('Content-Type', 'image/svg+xml');
    context.res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // Cache for 1 hour
    context.res.write(svg);
    context.res.end();
    
    return { props: {} };
  } catch (error) {
    console.error('Error generating dynamic OG image:', error);
    context.res.statusCode = 500;
    context.res.end('Error generating image');
    return { props: {} };
  }
};