/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // reactCompiler: {
  //   // Configuration options for reactCompiler
  // }
}

export default nextConfig
