import { useState } from "react"
import Button from "../../components/Button"
import Input from "../../components/input"
import { useNavigate } from 'react-router-dom'
const Form = ({
  isSignInPage = false,
}) => {
  const [data, setData] = useState({
    ...(!isSignInPage && {
      fullName: ''
    }),
    email: '',
    password: ''
  })
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    console.log('data :>> ', data);
    e.preventDefault()
    const res = await fetch(`http://localhost:8000/api/${isSignInPage ? 'login' : 'register'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })

    if (res.status === 400) {
      alert('Invalid credentials')
    } else {
      const resData = await res.json()
      if (resData.token) {
        localStorage.setItem('user:token', resData.token)
        localStorage.setItem('user:detail', JSON.stringify(resData.user))
        navigate('/')
      }
    }
  }

  return (
    <div className="bg-light h-screen flex justify-center items-center">
      <div className="bg-white w-[600px] h-[700px] shadow-lg rounded-lg flex flex-col justify-center items-center">
        <div className="text-4xl font-bold">Welcome {isSignInPage && "Back"}</div>
        <div className="text-xl font-light mb-14">{isSignInPage ? "Sign in now to Get Explore" : "Sign up now to Get Started"}</div>

        <form className="flex flex-col w-1/2 justify-center" onSubmit={(e) => handleSubmit(e)}>
          {!isSignInPage && <Input label="Full name" name="FullName" placeholder="Enter your FullName" className="w-full mb-6" value={data.fullName} onChange={(e) => setData({ ...data, fullName: e.target.value })} />}
          <Input label="Email address" name="email" placeholder="Enter your email" type="email" className="w-full mb-6" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
          <Input label="Password" name="password" placeholder="Please enter password" type="Password" className="w-full mb-10" value={data.password} onChange={(e) => setData({ ...data, password: e.target.value })} />
          <Button type="submit" label={isSignInPage ? "Log in" : "Sign Up"} className="w-full mb-2" /></form>

        <div>{isSignInPage ? "Didn't have an account?" : "Already have an account?"}<span className="text-primary cursor-pointer underline ml-1" onClick={() => navigate(`/users/${isSignInPage ? "sign_up" : "sign_in"}`)}>{isSignInPage ? "Sign up" : "Log in"}</span></div>
      </div></div>

  )
}

export default Form;
