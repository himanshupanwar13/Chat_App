import {useState} from "react"
import Button from "../../components/Button"
import Input from "../../components/input"
const Form = ({
    isSignInPage = true,
}) => {
  const [data, setData] = useState({
    ...(!isSignInPage && {
      fullName : ''
    }),
    email : '',
    password : ''
  })

  return (
    <div className="bg-white w-[600px] h-[700px] shadow-lg rounded-lg flex flex-col justify-center items-center">
      <div className="text-4xl font-bold">Welcome {isSignInPage && "Back"}</div>
      <div className="text-xl font-light mb-14">{isSignInPage? "Sign in now to Get Explore" : "Sign up now to Get Started" }</div>

      <form onSubmit={() => console.log("Submitted")} className="flex flex-col w-full items-center " >
        {!isSignInPage && <Input label="Full name" name="name" placeholder="Enter your FullName" className="mb-6" value={data.fullName} onChange={(e)=> setData({ ...data, fullName : e.target.value})} />}
      <Input label="Email address" name="email" placeholder="Enter your email" type="email" className="mb-6" value={data.email} onChange={(e)=> setData({ ...data, email : e.target.value}) } />
      <Input label="Password" name="password" placeholder="Please enter password" type="Password" className="mb-10" value={data.password} onChange={(e)=> setData({ ...data, password: e.target.value})} />
      <Button type="submit" label={isSignInPage? "Log in" : "Sign Up"} className="w-1/2 mb-2"/></form>
      
      <div>{isSignInPage? "Didn't have an account?" : "Already have an account?" }<span className="text-primary cursor-pointer underline ml-1">{isSignInPage? "Sign up" : "Log in"}</span></div>
    </div>
  )
}

export default Form
