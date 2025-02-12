import React from 'react'
import Image from 'next/image'
import Logo from "@/public/logo.png"

const Header = () => {
  return (
<header className="bg-white shadow-md p-4">
    <div className="w-48">
      <Image 
        src={Logo} 
        alt="Agent Finance Logo" 
      />
    </div>

</header>
  )
}

export default Header