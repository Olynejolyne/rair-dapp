import { useState, useEffect, useCallback } from 'react';
import { withSentryRouting } from "@sentry/react";
import { rFetch } from '../../utils/rFetch.js';
import { useSelector } from 'react-redux';
import { useParams, Router, Switch, Route, useHistory } from 'react-router-dom';
import WorkflowContext from '../../contexts/CreatorWorkflowContext.js';
import {web3Switch} from '../../utils/switchBlockchain.js';
import { minterAbi, erc721Abi, diamondFactoryAbi } from '../../contracts'
import chainData from '../../utils/blockchainData.js'

import ListOffers from './creatorSteps/ListOffers.jsx';
import ListLocks from './creatorSteps/ListLocks.jsx';
import CustomizeFees from './creatorSteps/CustomizeFees.jsx';
import BatchMetadata from './creatorSteps/batchMetadata.jsx';
import SingleMetadataEditor from './creatorSteps/singleMetadataEditor.jsx';
import MediaUpload from './creatorSteps/MediaUpload.jsx';

import ListOffersDiamond from './diamondCreatorSteps/ListOffersDiamond.jsx';
import DiamondMinterMarketplace from './diamondCreatorSteps/DiamondMinterMarketplace.jsx';

const SentryRoute = withSentryRouting(Route);

const WorkflowSteps = ({sentryHistory}) => {
	const {address, collectionIndex, blockchain} = useParams();

	const { minterInstance, contractCreator, programmaticProvider /*currentChain*/ } = useSelector(store => store.contractStore);
	const [contractData, setContractData] = useState();
	const [tokenInstance, setTokenInstance] = useState();
	const [correctMinterInstance, setCorrectMinterInstance] = useState();
	const [currentStep, setCurrentStep] = useState(0);
	const [simpleMode, setSimpleMode] = useState(true);
	const { primaryColor } = useSelector(store => store.colorStore);
	const [steps, setSteps] = useState([]);
	const history = useHistory();

	useEffect(() => {
		if (!contractData) {
			return;
		}
		let filteredSteps = [
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/offers',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/offers`,
				component: contractData.diamond ? ListOffersDiamond : ListOffers,
				simple: true,
				classic: true,
				diamond: true
			},
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/locks',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/locks`,
				component: ListLocks,
				simple: false,
				classic: true,
				diamond: false
			},
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/customizeFees',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/customizeFees`,
				component: CustomizeFees,
				simple: false,
				classic: true,
				diamond: false
			},
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/minterMarketplace',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/minterMarketplace`,
				component: DiamondMinterMarketplace,
				simple: true,
				classic: false,
				diamond: true
			},
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/metadata/batch',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/metadata/batch`,
				component: BatchMetadata,
				simple: true,
				classic: true,
				diamond: true
			},
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/metadata/single',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/metadata/single`,
				component: SingleMetadataEditor,
				simple: true,
				classic: true,
				diamond: true
			},
			{
				path: '/creator/contract/:blockchain/:address/collection/:collectionIndex/media',
				populatedPath: `/creator/contract/${blockchain}/${address}/collection/${collectionIndex}/media`,
				component: MediaUpload,
				simple: true,
				classic: true,
				diamond: true
			}
		]
		if (simpleMode) {
			filteredSteps = filteredSteps.filter(step => step.simple);
		}
		if (contractData.diamond) {
			filteredSteps = filteredSteps.filter(step => step.diamond === true);
		} else {
			filteredSteps = filteredSteps.filter(step => step.classic === true);
		}
		console.log('Step rerender');
		setSteps(filteredSteps);
	}, [contractData, address, collectionIndex, steps.length, simpleMode, blockchain])

	const onMyChain = window.ethereum ?
				chainData[contractData?.blockchain]?.chainId === window.ethereum.chainId
				:
				chainData[contractData?.blockchain]?.chainId === programmaticProvider?.provider?._network?.chainId

	const fetchData = useCallback(async () => {
		if (!address) {
			return;
		}
		let response2 = await rFetch(`/api/contracts/network/${blockchain}/${address}`);
		let response3 = await rFetch(`/api/contracts/network/${blockchain}/${address}/products`);
		if (response3.success) {
			response2.contract.products = response3.products
		}
		let response4 = await rFetch(`/api/contracts/network/${blockchain}/${address}/products/offers`);
		// Special case where a product exists but it has no offers
		if (response4.success) {
			response4.products.forEach(item => {
				response2.contract.products.forEach(existingItem => {
					if (item._id.toString() === existingItem._id.toString()) {
						existingItem.offers = item.offers;
					}
				})
			})
		}
		if (response2.contract) {
			response2.contract.product = (response2?.contract?.products?.filter(i => i?.collectionIndexInContract === Number(collectionIndex)))[0];
			delete response2.contract.products;
			setContractData(response2.contract);
		} else {
			// Try diamonds
			let instance = contractCreator(address, diamondFactoryAbi);
			let productData = await instance.getProductInfo(collectionIndex)
			let rangesData = [];
			for await (let rangeIndex of productData.rangeList) {
				let rangeData = await instance.rangeInfo(rangeIndex);
				rangesData.push({
					onMarketplace: false,
					rangeIndex: Number(rangeIndex.toString()),
					offerName: rangeData.rangeName,
					range: [Number(rangeData.rangeStart.toString()), Number(rangeData.rangeEnd.toString())],
					price: rangeData.rangePrice.toString(),
					lockedTokens: Number(rangeData.lockedTokens.toString()),
					tokensAllowed: Number(rangeData.tokensAllowed.toString()),
					mintableTokens: Number(rangeData.mintableTokens.toString())
				})
			};
			setContractData({
				title: await instance.name(),
				contractAddress: address,
				blockchain: window.ethereum.chainId,
				diamond: instance,
				product: {
					collectionIndexInContract: collectionIndex,
					name: productData.name,
					firstTokenIndex: Number(productData.startingToken.toString()),
					soldCopies: Number(productData.mintableTokens.toString()) - Number(productData.endingToken.toString()) - Number(productData.startingToken.toString()),
					copies: Number(productData.mintableTokens.toString()),
					offers: rangesData
				},
				instance
			});
		}
	}, [address, blockchain, collectionIndex, contractCreator]);
	
	const fetchMintingStatus = useCallback(async () => {
		if (!tokenInstance || !onMyChain) {
			return;
		}
		try {
			return await tokenInstance.hasRole(await tokenInstance.MINTER(), correctMinterInstance.address);
		} catch (err) {
			console.error(err);
			return false;
		}
	}, [correctMinterInstance, tokenInstance, onMyChain])

	useEffect(() => {
		// Fix this
		if (onMyChain) {
			let createdInstance = contractCreator(minterInstance.address, minterAbi)
			setCorrectMinterInstance(createdInstance);
		}
	}, [address, onMyChain, contractCreator, minterInstance.address])

	useEffect(() => {
		// Fix this
		if (onMyChain) {
			let createdInstance = contractCreator(address, erc721Abi)
			setTokenInstance(createdInstance);
		}
	}, [address, onMyChain, contractCreator])

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const goBack = useCallback(() => {
		history.push(steps[currentStep - 1].populatedPath)
	}, [steps, currentStep, history]);

	const initialValue = {
		contractData,
		steps,
		setStepNumber: setCurrentStep,
		gotoNextStep: () => {
			history.push(steps[currentStep + 1].populatedPath);
		},
		switchBlockchain: async () => web3Switch(chainData[contractData?.blockchain]?.chainId),
		goBack,
		minterRole: fetchMintingStatus(),
		onMyChain,
		correctMinterInstance,
		tokenInstance,
		simpleMode
	}

	return <WorkflowContext.Provider value={initialValue}>
		<WorkflowContext.Consumer>
			{({contractData, steps /*, setStepNumber*/}) => {
				return <div className='row px-0 mx-0'>
					<div className='col-12 my-5' style={{position: 'relative'}}>
						{steps.length > 0 &&
							currentStep !== 0 &&
							<div
								style={{position: 'absolute', left: 0}}
								className='border-stimorol btn rounded-rair p-0'>
								<button
									onClick={goBack}
									style={{border: 'none'}}
									className={`btn rounded-rair w-100 btn-${primaryColor}`}
									>
									<i className='fas fa-arrow-left'/> Back
								</button>
							</div>}
						{contractData && contractData.diamond && <div className='w-100 text-center h1'>
							<i className='fas fa-gem' />
						</div>}
						<h4>{contractData?.title}</h4>
						<small>{contractData?.product?.name}</small>
						<div className='w-75 mx-auto px-auto text-center'>
							{steps.map((item, index) => {
								return <div key={index} className='d-inline-block' style={{
									width: `${100 / steps.length * (index === 0 ? 0.09 : 1)}%`,
									height: '3px',
									position: 'relative',
									backgroundColor: `var(--${currentStep >= index ? 'bubblegum' : `charcoal-80`})`
								}}>
									<div style={{
										position: 'absolute',
										right: 0,
										top: '-10px',
										borderRadius: '50%',
										background: `var(--${currentStep >= index ? 'bubblegum' : primaryColor})`,
										height: '1.7rem',
										width: '1.7rem',
										margin: 'auto',
										border: 'solid 1px var(--charcoal-60)'
									}}>
										{index + 1}
									</div>
								</div>
							})}
						</div>
						<div className='row mt-3 w-100'>
							<div className='col-12 col-md-6 text-end'>
								<button
									onClick={() => setSimpleMode(true)}
									className={`btn btn-${simpleMode ? 'stimorol' : primaryColor} rounded-rair col-12 col-md-6`}>
									Simple
								</button>
							</div>
							<div className='col-12 col-md-6 text-start mb-3'>
								<button
									onClick={() => setSimpleMode(false)}
									className={`btn btn-${simpleMode ? primaryColor : 'stimorol' } rounded-rair col-12 col-md-6`}>
									Advanced
								</button>
							</div>
						</div>
					</div>
				</div>
			}}
		</WorkflowContext.Consumer>
		<Router history={sentryHistory}>
			<Switch>
				{steps.map((item, index) => {
					return <SentryRoute key={index} path={item.path} render={() => <item.component stepNumber={index} />} />
				})}
			</Switch>
		</Router>
	</WorkflowContext.Provider>
}

export default WorkflowSteps;