import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'English Quest | Sua próxima descoberta',description:'Espaço de aprendizagem das turmas de inglês. Aulas, descobertas e evolução.',robots:{index:false,follow:false},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
