import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { TUser } from '../types'

interface UserSlice {
    list: TUser[]
}

const initialState: UserSlice = {
    list: [],
}

export const userSlice = createSlice({
    name: 'user',
    initialState,
    reducers: {
        setUserList: (state, action: PayloadAction<TUser[]>) => {
            state.list = action.payload
        },
    },
})

export const { setUserList } = userSlice.actions

export default userSlice.reducer
